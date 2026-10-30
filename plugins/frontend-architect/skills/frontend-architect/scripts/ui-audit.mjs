#!/usr/bin/env node
// Static UI audit: accessibility and form-quality patterns that the markup itself proves or suggests.
// Vue templates come from the project's vue/compiler-sfc AST, JSX from TypeScript's parser (semantic
// engine); without them a lexical element scanner approximates tags and attributes. Only native HTML
// elements are judged: a custom component that wraps a control and owns its label is never reported.
// Static analysis cannot see rendered names, computed attributes, focus or contrast: those are marked
// as browser checks, never as defects. Read-only.
//
// Usage: ui-audit.mjs <project-root> [--rules a11y,forms] [--json|--md] [--fail-on confirmed|any|none]
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildGraph } from './lib/graph.mjs'
import { detectProject, excludeArg, loadConfig } from './lib/project.mjs'
import { ENGINE_HELP, addFinding, createReport, engineOptionsFrom, fail, finish, isMainModule, parseArgs, usage } from './lib/report.mjs'

const HELP = `
ui-audit — accessibility and form-quality patterns provable from the markup (static level).

usage: node ui-audit.mjs <project-root> [options]
  --rules <families>  comma-separated: a11y, forms (default both)
  --exclude <globs>   comma-separated project-relative globs to leave out (also "exclude" in .frontend-audit.json)
  --json | --md       output format
  --fail-on <level>   exit 1 on: confirmed (default) | any | none${ENGINE_HELP}

Every finding carries a verification field:
  static    the markup proves it (level confirmed): a native <img> with no alt attribute at all, an <input>
            with no label, no aria-label and no id any <label for> points to, a <div @click> with no role
  review    a pattern worth reading (level heuristic): an icon-only button whose child component may render a
            name, a heading jump, a form with a submit handler and no pending state anywhere
  browser   only a rendered page can tell (level info): bound :alt, :aria-label, computed ids, focus, contrast
Elements inside a custom component that declares a label-like prop (label, aria-label, title, legend) are
counted as encapsulated and not reported; spreads (v-bind="$attrs", {...props}) make an element unverifiable.

a11y findings: img-missing-alt, img-alt-dynamic (browser), form-control-without-label, button-without-accessible-name,
  link-without-href, click-handler-on-non-interactive, nested-interactive, aria-hidden-on-focusable, invalid-role,
  unknown-aria-attribute, positive-tabindex, heading-level-skipped, iframe-without-title, image-input-without-alt,
  dialog-without-name, table-without-headers, mouse-only-handler
forms findings: form-error-not-associated, form-without-pending-state, required-visual-only
Passing this audit is not WCAG conformance: contrast, reading order, timing, media alternatives and real
accessible names need a browser pass (browser-audit.mjs) and human review.
`

const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'details', 'audio', 'video'])
const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'slider', 'spinbutton', 'textbox', 'combobox', 'searchbox', 'treeitem', 'gridcell'])
const VALID_ROLES = new Set(['alert', 'alertdialog', 'application', 'article', 'banner', 'button', 'cell', 'checkbox', 'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'dialog', 'directory', 'document', 'feed', 'figure', 'form', 'grid', 'gridcell', 'group', 'heading', 'img', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'meter', 'navigation', 'none', 'note', 'option', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem', 'generic', 'paragraph', 'blockquote', 'caption', 'code', 'deletion', 'emphasis', 'insertion', 'strong', 'subscript', 'superscript', 'time', 'mark', 'suggestion', 'comment'])
const ARIA_ATTRS = new Set(['aria-activedescendant', 'aria-atomic', 'aria-autocomplete', 'aria-braillelabel', 'aria-brailleroledescription', 'aria-busy', 'aria-checked', 'aria-colcount', 'aria-colindex', 'aria-colindextext', 'aria-colspan', 'aria-controls', 'aria-current', 'aria-describedby', 'aria-description', 'aria-details', 'aria-disabled', 'aria-dropeffect', 'aria-errormessage', 'aria-expanded', 'aria-flowto', 'aria-grabbed', 'aria-haspopup', 'aria-hidden', 'aria-invalid', 'aria-keyshortcuts', 'aria-label', 'aria-labelledby', 'aria-level', 'aria-live', 'aria-modal', 'aria-multiline', 'aria-multiselectable', 'aria-orientation', 'aria-owns', 'aria-placeholder', 'aria-posinset', 'aria-pressed', 'aria-readonly', 'aria-relevant', 'aria-required', 'aria-roledescription', 'aria-rowcount', 'aria-rowindex', 'aria-rowindextext', 'aria-rowspan', 'aria-selected', 'aria-setsize', 'aria-sort', 'aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext'])
const LABEL_LIKE_PROPS = ['label', 'aria-label', 'ariaLabel', 'title', 'legend', 'name', 'placeholder-label']
const NAME_ATTRS = ['aria-label', 'aria-labelledby', 'title']
// input types whose accessible name does not come from a <label>: hidden, value-named buttons and image buttons (alt)
const HIDDEN_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image'])
const PENDING_ID_RE = /pending|loading|submitting|isSubmitting|busy|inFlight|saving|disabled/i

/** Normalises a Vue or JSX element record into one shape the rules read. */
function normalize(el, flavour) {
  if (flavour === 'vue') {
    const events = new Set(el.events.map((e) => e.toLowerCase()))
    const handlers = {}
    for (const [name, exp] of Object.entries(el.eventHandlers ?? {})) handlers[name.toLowerCase()] = { exp, modifiers: el.eventModifiers?.[name] ?? [] }
    const spread = el.directives.some((d) => d === 'v-bind') || Object.keys(el.attrs).some((k) => k === 'v-bind') || ('v-bind' in el.bound)
    return { tag: el.tag, line: el.line, isComponent: el.isComponent, attrs: el.attrs, bound: el.bound, events, handlers, hasText: el.hasText, childTags: el.childTags, hasSlot: el.hasSlot, parents: el.parents, parentRecords: null, spread, flavour }
  }
  // JSX: attributes come as static strings, true, or '{expr}'
  const attrs = {}
  const bound = {}
  const events = new Set()
  const handlers = {}
  let spread = false
  for (const [name, value] of Object.entries(el.attrs)) {
    if (name === '...spread') {
      spread = true
      continue
    }
    const canonical = name === 'htmlFor' ? 'for' : name === 'className' ? 'class' : name === 'tabIndex' ? 'tabindex' : name
    if (/^on[A-Z]/.test(name)) {
      const event = name.slice(2).toLowerCase()
      events.add(event)
      handlers[event] = { exp: el.handlers?.[event] ?? '{expr}', modifiers: [] }
      continue
    }
    if (value === '{expr}') bound[canonical] = '{expr}'
    else attrs[canonical] = value
  }
  return { tag: el.tag, line: el.line, isComponent: /^[A-Z]/.test(el.tag) || el.tag.includes('.'), attrs, bound, events, handlers, hasText: el.hasText, childTags: el.childTags ?? [], hasSlot: false, parents: el.parents ?? [], spread, flavour }
}

/** Lexical fallback: tags and attributes from a template string, no parent chain (rules that need it degrade to review). */
function lexicalElements(template, lineOffset = 0) {
  const out = []
  if (!template) return out
  const lines = (idx) => template.slice(0, idx).split('\n').length - 1 + lineOffset
  for (const m of template.matchAll(/<([A-Za-z][\w.-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g)) {
    const [, tag, rawAttrs] = m
    const attrs = {}
    const bound = {}
    const events = new Set()
    const handlers = {}
    for (const a of rawAttrs.matchAll(/([:@#]?[\w.:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
      const name = a[1]
      const value = a[2] ?? a[3]
      if (name.startsWith('@') || name.startsWith('v-on:')) {
        const parts = name.replace(/^@|^v-on:/, '').split('.')
        const event = parts[0].toLowerCase()
        events.add(event)
        handlers[event] = { exp: (value ?? '').trim(), modifiers: parts.slice(1) }
      }
      else if (name.startsWith(':') || name.startsWith('v-bind:')) bound[name.replace(/^:|^v-bind:/, '')] = value ?? ''
      else if (name === 'v-bind') bound['v-bind'] = value ?? ''
      else if (!name.startsWith('v-')) attrs[name] = value ?? true
    }
    const after = template.slice(m.index + m[0].length)
    const closeIdx = after.search(new RegExp(`<\\/${tag.replace('.', '\\.')}\\s*>`))
    const inner = m[3] ? '' : closeIdx >= 0 ? after.slice(0, closeIdx) : ''
    const hasText = /[^\s<>]/.test(inner.replace(/<[^>]*>/g, ''))
    const childTags = [...inner.matchAll(/<([A-Za-z][\w.-]*)/g)].map((c) => c[1])
    out.push({ tag, line: lines(m.index) + 1, isComponent: /^[A-Z]/.test(tag) || tag.includes('-'), attrs, bound, events, handlers, hasText, childTags, hasSlot: /<slot\b/.test(inner), parents: null, spread: 'v-bind' in bound, flavour: 'lexical' })
  }
  return out
}

export function run(argv) {
  const args = parseArgs(argv)
  if (args.help || !args._[0]) return usage(HELP)
  const root = resolve(args._[0])
  if (!existsSync(join(root, 'package.json'))) return fail(`no package.json in ${root}`)
  let config
  try {
    config = loadConfig(root, args.config, { exclude: excludeArg(args) })
  } catch (error) {
    return fail(error.message)
  }
  const families = new Set(String(args.rules ?? 'a11y,forms').split(',').map((s) => s.trim()).filter(Boolean))
  for (const f of families) if (!['a11y', 'forms'].includes(f)) return fail(`--rules accepts a11y and forms (got ${f})`)
  const project = detectProject(root, config)
  const report = createReport('ui-audit', project)
  let graph
  try {
    graph = buildGraph(project, { autoImports: false, ...engineOptionsFrom(args) })
  } catch (error) {
    return fail(error.message)
  }
  report.analysis = graph.analysis
  const counts = { files: 0, elements: 0, native: 0, encapsulated: 0, unverifiable: 0, browser: 0, byVerification: { static: 0, review: 0, browser: 0 } }
  const files = []

  const emit = ({ verification, ...rest }) => {
    const level = verification === 'static' ? 'confirmed' : verification === 'review' ? 'heuristic' : 'info'
    counts.byVerification[verification]++
    addFinding(report, { level, verification, ...rest })
  }

  for (const info of graph.files.values()) {
    let elements = []
    let source = 'none'
    if (info.isVue) {
      if (info.semantic?.elements?.length) {
        elements = info.semantic.elements.map((e) => normalize(e, 'vue'))
        source = 'ast'
      } else if (info.template) {
        elements = lexicalElements(info.template, (info.templateLine || 1) - 1)
        source = 'lexical'
      }
    } else if (/\.[jt]sx$/.test(info.rel) && info.semantic?.jsxElements?.length) {
      elements = info.semantic.jsxElements.map((e) => normalize(e, 'jsx'))
      source = 'ast'
    }
    if (!elements.length) continue
    counts.files++
    counts.elements += elements.length
    const native = elements.filter((e) => !e.isComponent)
    counts.native += native.length
    const scriptIds = info.semantic ? new Set([...info.semantic.valueIdentifiers.keys(), ...(info.declared ?? [])]) : new Set([...(info.declared ?? []), ...(info.ids ?? [])])
    const hasPendingIdentifier = [...scriptIds].some((n) => PENDING_ID_RE.test(n))
    const labelsFor = new Set(native.filter((e) => e.tag === 'label' && typeof e.attrs.for === 'string').map((e) => e.attrs.for))
    const labelTextById = new Map(native.filter((e) => e.tag === 'label' && typeof e.attrs.for === 'string').map((e) => [e.attrs.for, e.hasText]))
    const describedIds = new Set(native.map((e) => e.attrs.id).filter((id) => typeof id === 'string'))
    const componentParents = (e) => (e.parents ? e.parents.filter((p) => /^[A-Z]/.test(p) || p.includes('-')) : [])
    const encapsulated = (e) => {
      if (!e.parents) return false
      // nearest custom component ancestor that declares a label-like prop (static or bound)
      const ancestors = elements.filter((x) => x.isComponent && e.parents.includes(x.tag) && x.line <= e.line)
      return ancestors.some((a) => LABEL_LIKE_PROPS.some((p) => p in a.attrs || p in a.bound))
    }
    const hasName = (e) => NAME_ATTRS.some((a) => typeof e.attrs[a] === 'string' && e.attrs[a].trim()) || e.hasText
    const nameIsBound = (e) => NAME_ATTRS.some((a) => a in e.bound)
    const isFocusable = (e) => (e.tag === 'a' && ('href' in e.attrs || 'href' in e.bound || 'to' in e.bound)) || (INTERACTIVE_TAGS.has(e.tag) && e.tag !== 'a') || ('tabindex' in e.attrs && Number(e.attrs.tabindex) >= 0)
    // a click handler makes an element interactive only when it does something: `@click.stop` with no expression, or a
    // handler that only stops propagation / prevents default, is event plumbing, not an action
    const PLUMBING_RE = /^(?:\(?\s*\w*\s*\)?\s*=>\s*)?(?:\{\s*)?(?:\w+\.(?:stopPropagation|preventDefault)\(\)\s*;?\s*)+(?:\})?$/
    const realHandler = (e, event) => {
      const h = e.handlers?.[event]
      if (!h) return e.events.has(event)
      if (!h.exp) return false
      return !PLUMBING_RE.test(h.exp)
    }
    const focusDelegation = (e) => /\.focus\(\)\s*;?\s*$/.test(e.handlers?.click?.exp ?? '') && !/[;\n]/.test((e.handlers?.click?.exp ?? '').replace(/;\s*$/, ''))
    const HIDE_CLASS_RE = /(?:^|\s)(?:hidden|d-none|display-none|is-hidden)(?:\s|$)/
    const hiddenByClass = (e) => typeof e.attrs.class === 'string' && HIDE_CLASS_RE.test(e.attrs.class)
    const fileRecord = { file: info.rel, source, elements: elements.length, native: native.length, findings: 0 }
    const before = report.findings.length
    const where = (e) => ({ file: info.rel, line: e.line })

    if (families.has('a11y')) {
      let lastHeading = 0
      for (const e of native) {
        if (e.spread) {
          counts.unverifiable++
          continue
        }
        // images
        if (e.tag === 'img') {
          if ('alt' in e.attrs || e.attrs.role === 'presentation' || e.attrs.role === 'none') { /* fine, including alt="" */ } else if ('alt' in e.bound) {
            counts.browser++
            emit({ id: 'img-alt-dynamic', verification: 'browser', severity: 'low', ...where(e), message: `<img> alt is bound (${e.bound.alt.slice(0, 40)}): the rendered text decides; check it in the browser`, fix: 'make sure the bound value is a meaningful description, or alt="" when decorative' })
          } else emit({ id: 'img-missing-alt', verification: 'static', severity: 'high', ...where(e), message: '<img> without an alt attribute', fix: 'alt="" for decorative images, a description otherwise (or role="presentation")' })
        }
        if (e.tag === 'input' && e.attrs.type === 'image' && !('alt' in e.attrs) && !('alt' in e.bound)) emit({ id: 'image-input-without-alt', verification: 'static', severity: 'high', ...where(e), message: '<input type="image"> without alt', fix: 'alt describes the action of the button' })
        // form controls and their labels
        if (((e.tag === 'input' && !HIDDEN_INPUT_TYPES.has(e.attrs.type ?? '')) || e.tag === 'select' || e.tag === 'textarea') && !('hidden' in e.attrs)) {
          const wrappedByLabel = e.parents ? e.parents.includes('label') : false
          const id = typeof e.attrs.id === 'string' ? e.attrs.id : null
          const labelled = wrappedByLabel || (id && labelsFor.has(id)) || NAME_ATTRS.some((a) => typeof e.attrs[a] === 'string' && e.attrs[a].trim())
          if (!labelled) {
            if (encapsulated(e)) counts.encapsulated++
            else if (hiddenByClass(e)) {
              // display:none cannot be proven from a class name, but it is the usual meaning: the control would be outside
              // the accessibility tree (a hidden <input type="file"> opened by a visible button is the common case)
              counts.browser++
              emit({ id: 'form-control-without-label', verification: 'browser', severity: 'low', ...where(e), message: `<${e.tag}${e.attrs.type ? ` type="${e.attrs.type}"` : ''}> has no label and is hidden by class "${e.attrs.class.split(/\s+/).find((c) => HIDE_CLASS_RE.test(` ${c} `))}": if that is display:none it is outside the accessibility tree and its visible trigger needs the name; a rendered page decides`, fix: 'keep display:none controls out of the tab order and name the visible trigger; if the class only hides visually, associate a label' })
            } else if (nameIsBound(e) || 'id' in e.bound || 'aria-labelledby' in e.bound) {
              counts.browser++
              emit({ id: 'form-control-without-label', verification: 'browser', severity: 'low', ...where(e), message: `<${e.tag}> gets its name from a bound attribute (${Object.keys(e.bound).filter((k) => ['aria-label', 'aria-labelledby', 'id', 'title'].includes(k)).join(', ')}): verify the rendered name`, fix: 'keep the bound value non-empty in every state' })
            } else if (!e.parents) emit({ id: 'form-control-without-label', verification: 'review', severity: 'medium', ...where(e), message: `<${e.tag}> with no label attribute; wrapping <label> cannot be checked lexically`, fix: 'associate a <label for> or wrap the control in a <label>; aria-label when no visible text exists' })
            else emit({ id: 'form-control-without-label', verification: 'static', severity: 'high', ...where(e), message: `<${e.tag}>${id ? ` id="${id}"` : ''} has no <label for>, no wrapping <label>, no aria-label and no aria-labelledby`, fix: 'associate a <label for="id">, wrap the control in a <label>, or add aria-label when no visible text exists' })
          }
          if (families.has('forms')) {
            const invalid = e.attrs['aria-invalid'] === 'true' || 'aria-invalid' in e.bound
            if (invalid && !('aria-describedby' in e.attrs || 'aria-describedby' in e.bound || 'aria-errormessage' in e.attrs || 'aria-errormessage' in e.bound)) emit({ id: 'form-error-not-associated', verification: 'review', severity: 'medium', ...where(e), message: `<${e.tag}> can be marked aria-invalid but no aria-describedby / aria-errormessage links the error text`, fix: 'point aria-describedby at the error element id so the message is announced with the field' })
            if (id && labelTextById.has(id) && !('required' in e.attrs || 'aria-required' in e.attrs || 'required' in e.bound || 'aria-required' in e.bound)) {
              const labelEl = native.find((x) => x.tag === 'label' && x.attrs.for === id)
              if (labelEl && labelEl.childTags.length === 0 && info.template && new RegExp(`<label[^>]*for=["']${id}["'][^>]*>[^<]*\\*`).test(info.template)) emit({ id: 'required-visual-only', verification: 'review', severity: 'low', ...where(e), message: `label of #${id} shows an asterisk but the control is not required / aria-required`, fix: 'add required (or aria-required="true") so assistive technology announces it' })
            }
          }
        }
        // buttons
        if (e.tag === 'button' || (e.attrs.role === 'button' && !INTERACTIVE_TAGS.has(e.tag))) {
          if (!hasName(e)) {
            if (encapsulated(e)) counts.encapsulated++
            else if (nameIsBound(e)) {
              counts.browser++
              emit({ id: 'button-without-accessible-name', verification: 'browser', severity: 'low', ...where(e), message: 'button name comes from a bound attribute: verify it is never empty', fix: 'guarantee a non-empty aria-label in every state' })
            } else if (e.childTags.some((t) => /^[A-Z]/.test(t) || t.includes('-'))) emit({ id: 'button-without-accessible-name', verification: 'review', severity: 'medium', ...where(e), message: `button with no text and no aria-label; its child component (${e.childTags.join(', ')}) may or may not render a name`, fix: 'add aria-label (or visually hidden text) unless the child component is known to provide the name' })
            else emit({ id: 'button-without-accessible-name', verification: 'static', severity: 'high', ...where(e), message: 'button with no text content, no aria-label, no aria-labelledby and no title', fix: 'give the button visible text or an aria-label naming the action' })
          }
        }
        // links
        if (e.tag === 'a' && !('href' in e.attrs) && !('href' in e.bound) && !('to' in e.bound) && realHandler(e, 'click')) emit({ id: 'link-without-href', verification: 'static', severity: 'medium', ...where(e), message: '<a> with a click handler and no href: not focusable, not announced as a link', fix: 'use a <button> for actions; keep <a href> for navigation' })
        // click on non-interactive
        if (realHandler(e, 'click') && !INTERACTIVE_TAGS.has(e.tag) && e.tag !== 'label') {
          const role = e.attrs.role
          const keyHandler = ['keydown', 'keyup', 'keypress'].some((k) => e.events.has(k))
          const tabbable = 'tabindex' in e.attrs || 'tabindex' in e.bound
          if ((!role || !INTERACTIVE_ROLES.has(role)) && focusDelegation(e)) emit({ id: 'click-handler-on-non-interactive', verification: 'review', severity: 'low', ...where(e), message: `<${e.tag}> click only moves focus (${e.handlers.click.exp.slice(0, 40)}): a wrapper that focuses an inner control; verify the control itself is reachable by keyboard`, fix: 'keep the real control focusable and labelled; the wrapper needs no role' })
          else if (!role || !INTERACTIVE_ROLES.has(role)) emit({ id: 'click-handler-on-non-interactive', verification: 'static', severity: 'medium', ...where(e), message: `<${e.tag}> handles click but has no interactive role: keyboard and screen-reader users cannot reach it`, fix: 'use a <button>; if the element must stay, add role="button", tabindex="0" and a keydown handler for Enter/Space' })
          else if (!tabbable) emit({ id: 'click-handler-on-non-interactive', verification: 'static', severity: 'medium', ...where(e), message: `<${e.tag} role="${role}"> is not focusable (no tabindex)`, fix: 'add tabindex="0" and a keydown handler, or use a <button>' })
          else if (!keyHandler) emit({ id: 'click-handler-on-non-interactive', verification: 'review', severity: 'low', ...where(e), message: `<${e.tag} role="${role}"> is focusable but no keydown/keyup handler was found here`, fix: 'handle Enter and Space (a shared directive counts: verify it)' })
        }
        // nesting
        if (isFocusable(e) && e.parents && e.parents.some((p) => p === 'button' || p === 'a')) emit({ id: 'nested-interactive', verification: 'static', severity: 'high', ...where(e), message: `<${e.tag}> nested inside <${e.parents.find((p) => p === 'button' || p === 'a')}>: interactive content inside interactive content`, fix: 'flatten: one interactive element per control' })
        // aria
        if (e.attrs['aria-hidden'] === 'true' && isFocusable(e)) emit({ id: 'aria-hidden-on-focusable', verification: 'static', severity: 'high', ...where(e), message: `aria-hidden="true" on a focusable <${e.tag}>: reachable by keyboard, invisible to screen readers`, fix: 'hide it for everyone (hidden / inert) or keep it visible to assistive technology' })
        if (typeof e.attrs.role === 'string' && !e.attrs.role.split(/\s+/).some((r) => VALID_ROLES.has(r))) emit({ id: 'invalid-role', verification: 'static', severity: 'medium', ...where(e), message: `role="${e.attrs.role}" is not a WAI-ARIA role`, fix: 'use a valid role or remove the attribute' })
        for (const name of [...Object.keys(e.attrs), ...Object.keys(e.bound)]) if (name.startsWith('aria-') && !ARIA_ATTRS.has(name)) emit({ id: 'unknown-aria-attribute', verification: 'static', severity: 'medium', ...where(e), message: `${name} is not an ARIA attribute`, fix: 'check the spelling against the WAI-ARIA attribute list' })
        if ('tabindex' in e.attrs && Number(e.attrs.tabindex) > 0) emit({ id: 'positive-tabindex', verification: 'static', severity: 'medium', ...where(e), message: `tabindex="${e.attrs.tabindex}" forces a custom tab order`, fix: 'use tabindex="0" / "-1" and let the DOM order drive focus' })
        if (e.tag === 'iframe' && !('title' in e.attrs) && !('title' in e.bound)) emit({ id: 'iframe-without-title', verification: 'static', severity: 'medium', ...where(e), message: '<iframe> without a title', fix: 'title describes the embedded content' })
        if ((e.tag === 'dialog' || e.attrs.role === 'dialog' || e.attrs.role === 'alertdialog') && !NAME_ATTRS.some((a) => a in e.attrs || a in e.bound)) emit({ id: 'dialog-without-name', verification: 'static', severity: 'medium', ...where(e), message: `<${e.tag}${e.attrs.role ? ` role="${e.attrs.role}"` : ''}> has no aria-labelledby / aria-label`, fix: 'point aria-labelledby at the dialog heading' })
        if (e.tag === 'table' && !e.childTags.includes('th') && !elements.some((x) => x.tag === 'th' && x.parents && x.parents.includes('table') && x.line >= e.line)) emit({ id: 'table-without-headers', verification: 'review', severity: 'low', ...where(e), message: '<table> without any <th>', fix: 'header cells with scope, or role="presentation" for layout tables' })
        if ((realHandler(e, 'mouseover') || realHandler(e, 'mouseenter')) && !e.events.has('focus') && !e.events.has('focusin')) emit({ id: 'mouse-only-handler', verification: 'review', severity: 'low', ...where(e), message: `<${e.tag}> reacts to mouseover/mouseenter but not to focus`, fix: 'pair hover handlers with focus/focusin so keyboard users get the same behaviour' })
        // headings
        const h = /^h([1-6])$/.exec(e.tag)
        if (h) {
          const level = Number(h[1])
          if (lastHeading && level > lastHeading + 1) emit({ id: 'heading-level-skipped', verification: 'review', severity: 'low', ...where(e), message: `heading jumps from h${lastHeading} to h${level} inside this template`, fix: 'keep heading levels sequential; style with CSS, not by picking a smaller tag' })
          lastHeading = level
        }
      }
    }

    if (families.has('forms')) {
      for (const e of native) {
        if (e.tag !== 'form' || !e.events.has('submit')) continue
        const submitButtons = native.filter((x) => (x.tag === 'button' && (x.attrs.type === 'submit' || !('type' in x.attrs))) || (x.tag === 'input' && x.attrs.type === 'submit'))
        const buttonGuarded = submitButtons.some((b) => 'disabled' in b.bound || 'loading' in b.bound || 'aria-busy' in b.bound || 'aria-disabled' in b.bound)
        if (!buttonGuarded && !hasPendingIdentifier) emit({ id: 'form-without-pending-state', verification: 'review', severity: 'medium', ...where(e), message: 'form with a submit handler, no pending/loading identifier in the script and no disabled/loading binding on its submit button', fix: 'track a pending flag: disable or mark the submit button (aria-busy) and ignore re-entrant submits until the request settles' })
      }
    }
    fileRecord.findings = report.findings.length - before
    files.push(fileRecord)
  }

  report.summary = { filesWithMarkup: counts.files, elements: counts.elements, nativeElements: counts.native, findings: report.findings.length, byVerification: counts.byVerification, encapsulatedByComponent: counts.encapsulated, unverifiable: counts.unverifiable, browserChecks: counts.browser, rules: [...families].join(',') }
  report.data = { files, verification: { static: 'the markup proves it (confirmed)', review: 'read the component (heuristic)', browser: 'only a rendered page can tell (info)' } }
  const sections = files.length ? [{ title: 'Files with markup', table: { headers: ['file', 'source', 'elements', 'native', 'findings'], rows: files.filter((f) => f.findings).map((f) => [f.file, f.source, f.elements, f.native, f.findings]) } }] : []
  report.notes.push('Static level: names, focus order, contrast, reading order and live regions need a rendered page (browser-audit.mjs) and human review; this report is not WCAG conformance.')
  if (graph.analysis?.engine !== 'semantic') report.notes.push('lexical engine: template elements were approximated by a regex scanner without a parent chain; wrapping <label> and component encapsulation cannot be seen, so some findings stay at review level')
  return finish(report, args, { sections })
}

// Set the exit code instead of calling process.exit: large --json outputs piped to another process
// would otherwise be truncated at 64 KiB when the process exits before stdout drains.
if (isMainModule(import.meta.url)) process.exitCode = run(process.argv.slice(2))
