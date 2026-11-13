#!/usr/bin/env node
// Inventory of the project's OWN design system, for people and agents alike: which components exist under the
// design-system roots, who owns each one (project source, a wrapper around the UI library, an ejected copy), its
// API (props, emits, models, slots), its variant axes, the tokens it consumes, whether a data view renders the five
// states, whether it is documented, and whether an ejected copy drifted from the source it was copied from.
// Static and lexical (v1): it reads single-file components, never renders, never follows the library's internals.
// Props spread from an import or built at runtime are reported as partially resolved, not guessed. Colour and size
// literals are COUNTED per component only; the findings about them belong to design-consistency.mjs, and the
// accessibility of the markup to ui-audit.mjs. Read-only.
//
// Usage: design-system-inventory.mjs <project-root> [--json|--md|--agents] [--roots a,b] [--fail-on confirmed|any|none]
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { readJson, readText, rel, toPosix } from './lib/fs.mjs'
import { detectProject, excludeArg, excludedBy, loadConfig } from './lib/project.mjs'
import { addFinding, createReport, fail, finish, isMainModule, mdTable, parseArgs, usage } from './lib/report.mjs'
import { extractImports, splitSfc, stripComments, toPascalCase } from './lib/source.mjs'

const HELP = `
design-system-inventory — what the project's design system contains, in the shape people and agents both read.

usage: node design-system-inventory.mjs <project-root> [options]
  --roots <dirs>      comma-separated project-relative roots (default: components/ui, components/design-system,
                      app/components/ui, app/components/design-system, and the same inside every Nuxt layer;
                      also "designSystem.roots" in .frontend-audit.json)
  --exclude <globs>   comma-separated project-relative globs to leave out (also "exclude" in .frontend-audit.json)
  --json | --md       output format; --agents prints only the Markdown section meant for AGENTS.md / CLAUDE.md
  --fail-on <level>   exit 1 on: confirmed (default) | any | none

Per component: owner (project | library-wrapper | ejected-copy), public (exported from the root's index.ts; with no
barrel every component is public), documented (a leading doc comment, @example, or a sibling .md / .stories.*),
props with their resolution (declared | declared-type | spread-from-import | unresolved), emits, models, slots,
variant axes (tailwind-variants / cva), tokens used (CSS custom properties) and literals counted, the data-view
states a component renders (loading, empty, error, partial, success) and the ejection marker
  <!-- @ds-ejected from="<registry>/<name>" version="<v>" sha256="<hash of the file without this line>" -->
whose stale hash is the drift signal.

findings: undocumented-public-component (confirmed), pass-through-wrapper (confirmed),
  data-view-missing-states (heuristic), ejected-copy-drifted (confirmed), props-partially-resolved (info)
Never reported here: literals (design-consistency.mjs), accessibility (ui-audit.mjs), private undocumented components.
Static level: runtime-computed props and variants are heuristic or unresolved; "documented" is presence, not quality.
`

const DEFAULT_ROOTS = ['components/ui', 'components/design-system', 'app/components/ui', 'app/components/design-system']
const LIBRARIES = [
  ['@nuxt/ui', /^U[A-Z]/],
  ['primevue', /^(?:Prime|P)[A-Z]/],
  ['reka-ui', /^(?:Dialog|Popover|Select|Combobox|Tabs|Accordion|Tooltip)[A-Z]?/],
]
const MARKER_RE = /^<!-- @ds-ejected from="([^"]+)" version="([^"]+)" sha256="([0-9a-f]{64})" -->\r?\n/
const MARKER_LOOSE_RE = /^\s*<!--\s*@ds-ejected\b[^>]*-->\r?\n?/ // something that wants to be a marker but is not well-formed (audit I4)
const STATES = ['loading', 'empty', 'error', 'partial', 'success']

/** Everything between the brace that follows `index` and its match, or null. */
function braceBlock(code, index) {
  const open = code.indexOf('{', index)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < code.length; i++) {
    const ch = code[i]
    if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return { start: open, end: i, text: code.slice(open + 1, i) }
  }
  return null
}

/** Top-level `key:` names of an object or type literal body (ignores nested braces/parens/brackets). */
function topLevelKeys(body) {
  const keys = []
  let depth = 0
  let lineStart = true
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if ('{(['.includes(ch)) depth++
    else if ('})]'.includes(ch)) depth = Math.max(0, depth - 1) // < > are generics or arrows here, never nesting
    if (depth === 0 && (lineStart || body[i - 1] === ',' || body[i - 1] === ';')) {
      const m = /^\s*(?:readonly\s+)?['"]?([A-Za-z_$][\w$-]*)['"]?\??\s*[:(]/.exec(body.slice(i))
      if (m) keys.push(m[1])
    }
    lineStart = ch === '\n'
  }
  return [...new Set(keys)]
}

/** `name: { ... default: X }` → { name: X } for simple literals in a runtime props object. */
function runtimeDefaults(body) {
  const out = {}
  for (const m of body.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*\{([^{}]*)\}/g)) {
    const d = /\bdefault\s*:\s*(?:'([^']*)'|"([^"]*)"|(true|false|-?\d+(?:\.\d+)?))/.exec(m[2])
    if (d) out[m[1]] = d[1] ?? d[2] ?? (d[3] === 'true' ? true : d[3] === 'false' ? false : Number(d[3]))
  }
  return out
}

function parseProps(script, imports) {
  const code = stripComments(script)
  const i = code.search(/\bdefineProps\b/)
  if (i < 0) return { resolution: 'declared', names: [], defaults: {} }
  const after = code.slice(i + 'defineProps'.length)
  // type-based: defineProps<{ ... }>()  (possibly wrapped by withDefaults)
  if (/^\s*</.test(after)) {
    let block = null
    let inherits = [] // types the props type extends or intersects: the inline list is then PARTIAL (audit I1)
    const generic = /^\s*<\s*([A-Za-z_$][\w$]*)\s*>/.exec(after) // defineProps<Props>()
    if (generic) {
      const decl = code.search(new RegExp(`\\b(?:type\\s+${generic[1]}\\s*=|interface\\s+${generic[1]}\\b)`))
      if (decl >= 0) {
        block = braceBlock(code, decl)
        const header = code.slice(decl, block ? block.start : decl + 200)
        const ext = /\binterface\s+\w+\s+extends\s+([^{]+)/.exec(header)
        if (ext) inherits = ext[1].split(',').map((t) => t.trim().replace(/<.*$/, '')).filter(Boolean)
        const inter = /\btype\s+\w+\s*=\s*([^{]*?)&\s*$/.exec(header.trimEnd()) || /\btype\s+\w+\s*=\s*([^{]*?)&/.exec(header)
        if (inter) inherits = inter[1].split('&').map((t) => t.trim().replace(/<.*$/, '')).filter(Boolean)
        if (block && !inter && !ext && /\btype\s+\w+\s*=\s*\{/.test(header) === false && /\btype\s+\w+\s*=/.test(header)) {
          // type Props = Other (an alias of an alias / an imported type)
          const rhs = /\btype\s+\w+\s*=\s*([A-Za-z_$][\w$.]*)/.exec(header)
          if (rhs) inherits = [rhs[1]]
        }
      }
      if (!block && !inherits.length) return { resolution: 'unresolved', names: [], defaults: {}, spreadFrom: [generic[1]] } // the type lives elsewhere
    } else {
      block = braceBlock(code, i)
      // defineProps<Base & { … }>(): everything before the brace that is not whitespace is an intersected type
      const inline = code.slice(i + 'defineProps'.length, block ? block.start : i).replace(/^\s*<\s*/, '')
      if (/&/.test(inline)) inherits = inline.split('&').map((t) => t.trim().replace(/<.*$/, '')).filter(Boolean)
    }
    const names = block ? topLevelKeys(block.text) : []
    if (inherits.length) {
      const from = inherits.map((id) => imports.find((imp) => imp.names?.some((n) => (typeof n === 'string' ? n : n.local ?? n.name) === id))?.source ?? id)
      return { resolution: inherits.some((id) => imports.some((imp) => imp.names?.some((n) => (typeof n === 'string' ? n : n.local ?? n.name) === id))) ? 'spread-from-import' : 'unresolved', names, defaults: {}, spreadFrom: from }
    }
    const defaults = {}
    const wd = code.search(/\bwithDefaults\s*\(/)
    if (wd >= 0 && block) {
      // the defaults object is the argument after defineProps<...>()
      const close = code.indexOf(')', block.end)
      const dblock = braceBlock(code, close)
      if (dblock) for (const m of dblock.text.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(?:'([^']*)'|"([^"]*)"|(true|false|-?\d+(?:\.\d+)?))/g)) defaults[m[1]] = m[2] ?? m[3] ?? (m[4] === 'true' ? true : m[4] === 'false' ? false : Number(m[4]))
    }
    return { resolution: names.length || block ? 'declared-type' : 'unresolved', names, defaults }
  }
  // runtime: defineProps({ ... }) or defineProps(ident)
  const paren = after.indexOf('(')
  const arg = after.slice(paren + 1).trimStart()
  if (arg.startsWith('{')) {
    const block = braceBlock(code, i)
    const body = block?.text ?? ''
    const names = topLevelKeys(body)
    const spreads = [...body.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
    const spreadFrom = spreads.map((id) => imports.find((imp) => imp.names?.some((n) => (typeof n === 'string' ? n : n.local ?? n.name) === id))?.source).filter(Boolean)
    const resolution = spreads.length ? (spreadFrom.length ? 'spread-from-import' : 'unresolved') : 'declared'
    return { resolution, names, defaults: runtimeDefaults(body), ...(spreads.length ? { spreadFrom: spreadFrom.length ? spreadFrom : spreads } : {}) }
  }
  const ident = /^([A-Za-z_$][\w$]*)/.exec(arg)?.[1]
  const from = ident && imports.find((imp) => imp.names?.some((n) => (typeof n === 'string' ? n : n.local ?? n.name) === ident))?.source
  return { resolution: from ? 'spread-from-import' : 'unresolved', names: [], defaults: {}, ...(ident ? { spreadFrom: [from ?? ident] } : {}) }
}

function parseEmits(script, template) {
  const code = stripComments(script)
  const out = new Set()
  const i = code.search(/\bdefineEmits\b/)
  if (i >= 0) {
    const after = code.slice(i + 'defineEmits'.length)
    if (/^\s*</.test(after)) { const b = braceBlock(code, i); if (b) for (const k of topLevelKeys(b.text)) out.add(k) }
    else for (const m of after.slice(0, after.indexOf(')') + 1).matchAll(/['"]([\w:-]+)['"]/g)) out.add(m[1])
  }
  for (const m of `${code}\n${template}`.matchAll(/\$?emit\(\s*['"]([\w:-]+)['"]/g)) out.add(m[1])
  return [...out]
}

function parseModels(script) {
  const code = stripComments(script)
  const out = []
  for (const m of code.matchAll(/\bdefineModel\b(?:<[^>]*>)?\s*\(\s*(?:['"]([\w-]+)['"])?/g)) out.push(m[1] ?? 'modelValue')
  return [...new Set(out)]
}

function parseSlots(script, template) {
  const out = new Set()
  const code = stripComments(script)
  const i = code.search(/\bdefineSlots\b/)
  if (i >= 0) { const b = braceBlock(code, i); if (b) for (const k of topLevelKeys(b.text)) out.add(k) }
  if (/\$slots\b/.test(template) && /#\[/.test(template)) out.add('*')
  for (const m of template.matchAll(/<slot\b([^>]*)>/g)) {
    const name = /(?<![:\w.-])name\s*=\s*["']([\w-]+)["']/.exec(m[1])?.[1]
    if (name) out.add(name)
    else if (!/:name\s*=/.test(m[1])) out.add('default')
  }
  return [...out]
}

/** Variant axes from a tailwind-variants `tv({ variants: {...} })` or a cva `cva(base, { variants: {...} })` call. */
function parseVariants(script) {
  const code = stripComments(script)
  const call = code.search(/\b(?:tv|cva)\s*\(/)
  if (call < 0) return null
  const v = code.indexOf('variants', call)
  if (v < 0) return null
  const block = braceBlock(code, v)
  if (!block) return null
  const axes = {}
  let pos = 0
  while (pos < block.text.length) {
    const m = /([A-Za-z_$][\w$]*)\s*:\s*\{/.exec(block.text.slice(pos))
    if (!m) break
    const axisStart = pos + m.index
    const inner = braceBlock(block.text, axisStart)
    if (!inner) break
    axes[m[1]] = topLevelKeys(inner.text)
    pos = inner.end + 1
  }
  return Object.keys(axes).length ? { source: /\bcva\s*\(/.test(code) ? 'cva' : 'tailwind-variants', axes } : null
}

/**
 * Tokens a component consumes: `var(--x)` references, plus — for a Tailwind v4 `@theme` layer — the colour utilities
 * that resolve to a declared `--color-*` token (`bg-accent-500`, `text-neutral-700`, `border-danger-500/40`, with any
 * variant prefix). Only tokens the project declares are matched, so a utility of a colour the project never defined
 * (Tailwind's own palette) is not counted as a token.
 */
function tokensUsed(text, declared = []) {
  const used = new Set([...text.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]))
  const colours = declared.filter((t) => t.startsWith('--color-')).map((t) => t.slice('--color-'.length))
  if (colours.length) {
    const re = new RegExp(`(?:^|[\\s"'\`:(\\[])(?:[\\w-]+:)*(?:bg|text|border|ring|outline|fill|stroke|from|to|via|accent|caret|decoration|divide|placeholder|shadow)-(${colours.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:\\/\\d+)?(?=[\\s"'\`)\\]]|$)`, 'g')
    for (const m of text.matchAll(re)) used.add(`--color-${m[1]}`)
  }
  return [...used]
}

/** Colour literals outside var(): hex, rgb()/hsl() in classes, inline styles and <style> blocks. */
function countLiterals(text) {
  const withoutVars = text.replace(/var\([^)]*\)/g, '')
  const hex = withoutVars.match(/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g) ?? []
  const fn = withoutVars.match(/\b(?:rgba?|hsla?|oklch|lab)\(/g) ?? []
  return hex.length + fn.length
}

/** A data view renders a collection (v-for) AND carries an async/pending/status signal. States are lexical signals. */
function dataView(props, script, template) {
  const code = stripComments(script)
  // "renders a collection": an explicit v-for, or a library data component bound to data (hold-out ds/B-05 showed a
  // <UTable :data="data"> table with no loop anywhere — the same thing without the v-for)
  const hasLoop = /\bv-for\s*=/.test(template) || /<(?:U|Prime|P)?(?:Table|DataTable|Carousel|Tree|VirtualList|Listbox)\b[^>]*\s:(?:data|rows|items|value)\s*=/.test(template)
  // a generic argument may sit between the composable and its call: useFetch<Row[]>('/api/orders') (corpus ds/05)
  const asyncSignal = /\b(?:useAsyncData|useLazyAsyncData|useFetch|useLazyFetch|useQuery|useInfiniteQuery)\s*(?:<[^()]*>)?\s*\(/.test(code)
  const statusProp = props.names.some((n) => /^(?:pending|loading|status|view|state|isLoading|query)$/.test(n))
  const statusUnion = /status\s*:\s*['"](?:loading|success|error)['"]/.test(code)
  // a region that switches on a status prop and hands the rows to a scoped slot is a data view without a loop of its own
  const switchesOnStatus = /\b(?:view|state|query)\.status\b|\bstatus\s*===?\s*['"]/.test(template)
  const rendersRows = hasLoop || /<slot\b[^>]*\s:(?:rows|items|data)\s*=/.test(template) || /['"]success['"]/.test(template)
  if (!(hasLoop && (asyncSignal || statusProp || statusUnion)) && !(switchesOnStatus && (statusProp || statusUnion))) return null
  const t = `${code}\n${template}`
  const states = []
  if (/\b(?:pending|loading|isLoading)\b|['"]loading['"]|USkeleton|aria-busy/.test(t)) states.push('loading')
  if (/['"]empty['"]|name="empty"|\??\.length\s*===?\s*0|!\s*[\w.]+\??\.length\b|v-else-if="![\w.?]+"|\.length\s*<\s*1/.test(t)) states.push('empty')
  if (/['"]error['"]|\berror\b/.test(t)) states.push('error')
  if (/['"]partial['"]|\bpartial\b/.test(t)) states.push('partial')
  if (rendersRows) states.push('success')
  return { states, missing: STATES.filter((s) => !states.includes(s)) }
}

function documented(text, file) {
  const rest = MARKER_RE.test(text) ? text.replace(MARKER_RE, '') : MARKER_LOOSE_RE.test(text) ? text.replace(MARKER_LOOSE_RE, '') : text
  if (/^\s*<!--/.test(rest)) return true
  if (/\/\*\*[\s\S]*?\*\/\s*(?:export\s+default|const\s+props|defineProps)/.test(text)) return true
  if (/@example\b/.test(text)) return true
  const base = file.replace(/\.vue$/, '')
  return ['.md', '.stories.ts', '.stories.js', '.stories.vue', '.story.vue'].some((ext) => existsSync(base + ext))
}

/** Root elements of the template (opened at the smallest indentation; a v-if/v-else chain yields several): tag and attributes. */
function rootElements(template) {
  const lines = template.split('\n').map((l) => /^(\s*)<([A-Za-z][\w-]*)([^>]*)>?/.exec(l)).filter(Boolean)
  if (!lines.length) return []
  const min = Math.min(...lines.map((m) => m[1].length))
  return lines.filter((m) => m[1].length === min).map((m) => ({ tag: m[2].includes('-') ? toPascalCase(m[2]) : m[2], attrs: m[3] }))
}
/** True when the root carries anything of its own besides forwarding attrs: a static attribute is a default the wrapper adds (audit I5). */
function rootAddsDefaults(attrs) {
  const cleaned = attrs.replace(/\s+v-bind="\$attrs"/g, '').replace(/\s+v-bind:?\s*=\s*"\$attrs"/g, '').trim()
  return /[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?/.test(cleaned)
}

/** True when the script does nothing beyond imports, defineOptions and type declarations. */
function scriptIsInert(script) {
  const code = stripComments(script).replace(/\bimport\b[^\n]*\n/g, '').replace(/\bdefineOptions\s*\([\s\S]*?\)\s*;?/g, '').replace(/\b(?:type|interface)\s+\w+[\s\S]*?(?:\n\}|\n)/g, '')
  return !/\b(?:defineProps|defineEmits|defineModel|defineExpose|ref|reactive|computed|watch|watchEffect|onMounted|onBeforeUnmount|function|=>|emit\()/.test(code)
}

function listVue(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listVue(p))
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out.sort()
}

/**
 * The public surface from the root's barrel. Follows every form a barrel takes (audit I2): `export { default as X } from
 * './X.vue'` (any relative path), `export { X, Y as Z } from '…'`, `import X from '…' … export { X }`, and `export * from
 * './sub'` into a sub-barrel (recursively, cycle-safe). Returns null when the root has no barrel.
 */
function parseBarrel(dir, seen = new Set()) {
  const file = ['index.ts', 'index.js', 'index.mts', 'index.mjs'].map((n) => join(dir, n)).find((f) => existsSync(f))
  if (!file || seen.has(file)) return null
  seen.add(file)
  const names = new Set()
  const src = stripComments(readText(file))
  const local = new Map() // identifier -> source module of a default/named import
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g)) local.set(m[1], m[2])
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) for (const n of m[1].split(',')) { const id = n.trim().split(/\s+as\s+/).pop(); if (id) local.set(id, m[2]) }
  // export { default as X } from '…' / export { A, B as C } from '…'
  for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) for (const n of m[1].split(',')) { const id = n.trim().split(/\s+as\s+/).pop(); if (/^[A-Z]/.test(id ?? '')) names.add(id) }
  // export { X, Y as Z } (no from): the identifiers were imported above
  for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*(?!\s*from)(?=;|\n|$)/g)) for (const n of m[1].split(',')) { const parts = n.trim().split(/\s+as\s+/); const id = parts.pop(); if (/^[A-Z]/.test(id ?? '') && (local.has(parts[0] ?? id) || local.has(id))) names.add(id) }
  // export * from './sub' -> the sub-barrel's names
  for (const m of src.matchAll(/export\s*\*\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const target = join(dirname(file), m[1])
    const subDir = existsSync(target) && statSync(target).isDirectory() ? target : null
    const sub = subDir ? parseBarrel(subDir, seen) : null
    if (sub) for (const n of sub.names) names.add(n)
    else for (const cand of [target, `${target}.ts`, `${target}.js`]) if (existsSync(cand) && statSync(cand).isFile() && !seen.has(cand)) { seen.add(cand); for (const n of collectNames(cand, seen)) names.add(n) }
  }
  return { file, names }
}
/** Names re-exported by a non-index module reached through `export *` (same forms, recursively). */
function collectNames(file, seen) {
  const names = new Set(); const src = stripComments(readText(file))
  for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) for (const n of m[1].split(',')) { const id = n.trim().split(/\s+as\s+/).pop(); if (/^[A-Z]/.test(id ?? '')) names.add(id) }
  for (const m of src.matchAll(/export\s*\*\s*from\s*['"](\.[^'"]+)['"]/g)) { const t = join(dirname(file), m[1]); for (const cand of [t, `${t}.ts`, `${t}.js`, join(t, 'index.ts')]) if (existsSync(cand) && statSync(cand).isFile() && !seen.has(cand)) { seen.add(cand); for (const n of collectNames(cand, seen)) names.add(n) } }
  return names
}

function detectLibrary(project) {
  for (const [name, prefix] of LIBRARIES) if (project.deps[name]) return { name, version: project.deps[name], source: 'package.json', prefix }
  if (existsSync(join(project.root, 'components.json'))) return { name: 'shadcn-vue', version: null, source: 'components.json', prefix: null }
  return { name: null, version: null, source: null, prefix: null }
}

function declaredTokens(project) {
  const out = new Set()
  const dirs = ['assets', 'app/assets', 'src/assets', 'styles', 'app/styles', 'src/styles', 'public'].map((d) => join(project.root, d)).filter(existsSync)
  const visit = (dir) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) visit(p); else if (/\.(?:css|scss|pcss)$/.test(name)) for (const m of readText(p).matchAll(/(--[\w-]+)\s*:/g)) out.add(m[1]) } }
  for (const d of dirs) visit(d)
  return [...out]
}

function resolveRoots(project, args) {
  // designSystem.roots lives in .frontend-audit.json next to the keys loadConfig already flattens; read it from the file
  const fromFile = project.config?.file ? (readJson(join(project.root, project.config.file))?.designSystem?.roots ?? null) : null
  const configured = args.roots ? String(args.roots).split(',').map((s) => s.trim()).filter(Boolean) : fromFile
  const candidates = new Set(configured ?? DEFAULT_ROOTS)
  if (!configured) {
    for (const layer of project.nuxt?.layers ?? []) for (const r of ['components/ui', 'components/design-system']) candidates.add(toPosix(join(layer, r)))
    for (const ext of project.nuxt?.extends ?? []) if (ext.startsWith('.')) for (const r of ['components/ui', 'components/design-system']) candidates.add(toPosix(join(ext, r)))
  }
  const roots = [...candidates].filter((r) => existsSync(join(project.root, r)) && statSync(join(project.root, r)).isDirectory())
  return { roots, looked: [...candidates] }
}

export function inventory(project, args = {}) {
  const { roots, looked } = resolveRoots(project, args)
  if (!roots.length) return { error: `no design-system root found (looked in ${looked.join(', ')}); pass --roots or set designSystem.roots in .frontend-audit.json` }
  const library = detectLibrary(project)
  const barrel = parseBarrel(join(project.root, roots[0]))
  const declared = declaredTokens(project)
  const components = []
  for (const root of roots) {
    const layer = /^layers\/([^/]+)\//.exec(root)?.[1] ?? (project.nuxt?.extends ?? []).find((e) => root.startsWith(`${e.replace(/^\.\//, '')}/`))?.split('/').pop() ?? null
    for (const file of listVue(join(project.root, root))) {
      const relFile = rel(project.root, file)
      if (excludedBy(project, relFile) !== -1) continue
      const text = readText(file)
      const marker = MARKER_RE.exec(text)
      const malformed = !marker && MARKER_LOOSE_RE.test(text) ? MARKER_LOOSE_RE.exec(text)[0] : null
      const body = marker ? text.slice(marker[0].length) : malformed ? text.slice(malformed.length) : text
      const { script, template } = splitSfc(body)
      const imports = extractImports(script)
      const props = parseProps(script, imports)
      const emits = parseEmits(script, template)
      const models = parseModels(script)
      const slots = parseSlots(script, template)
      const name = toPascalCase(basename(file, '.vue'))
      const roots = rootElements(template)
      const tag = roots.length === 1 ? roots[0].tag : null
      const wraps = tag && library.prefix && library.prefix.test(tag) && !/^Ui/.test(tag) ? tag : null
      const addsDefaults = wraps ? rootAddsDefaults(roots[0].attrs) : false
      const owner = marker || malformed ? 'ejected-copy' : wraps ? 'library-wrapper' : 'project'
      const ejected = marker ? { from: marker[1], version: marker[2], drifted: createHash('sha256').update(body).digest('hex') !== marker[3] }
        : malformed ? { from: /from="([^"]*)"/.exec(malformed)?.[1] ?? null, version: /version="([^"]*)"/.exec(malformed)?.[1] ?? null, drifted: null, malformed: true } : null
      const isPublic = barrel ? barrel.names.has(name) : true
      const comp = {
        file: relFile, name, layer, owner, wraps, public: isPublic, documented: documented(text, file),
        props, emits, slots, models,
        variants: parseVariants(script),
        tokens: { used: tokensUsed(text, declared), literals: countLiterals(`${template}\n${splitSfc(body).styles.join('\n')}`) },
        dataView: dataView(props, script, template),
        ejected,
        passThrough: owner === 'library-wrapper' && !addsDefaults && !props.names.length && !emits.length && !models.length && scriptIsInert(script) && (slots.includes('*') || slots.includes('default')),
      }
      components.push(comp)
    }
  }
  const used = new Set(components.flatMap((c) => c.tokens.used))
  return { roots, library: { name: library.name, version: library.version, source: library.source }, barrel: barrel ? rel(project.root, barrel.file) : null, components, tokens: { declared, unused: declared.filter((t) => !used.has(t)) } }
}

function agentsSection(inv, project) {
  const out = [`## Design system (generated by design-system-inventory — do not edit)`, '']
  out.push(`Library: ${inv.library.name ? `${inv.library.name}${inv.library.version ? ` ${inv.library.version}` : ''}` : 'none detected'}. Roots: ${inv.roots.join(', ')}. ${inv.barrel ? `Import public components from \`${inv.barrel}\`.` : 'No barrel: every component under the roots is public.'}`)
  if (inv.tokens.declared.length) out.push(`Tokens in use (CSS custom properties): ${inv.tokens.declared.filter((t) => !inv.tokens.unused.includes(t)).join(', ') || 'none'}.`)
  out.push('', mdTable(['Component', 'Doc', 'Props (defaults)', 'Emits', 'Models', 'Slots', 'Variants'], inv.components.filter((c) => c.public).map((c) => [
    `${c.name}${c.owner === 'ejected-copy' ? ' (ejected)' : c.wraps ? ` (wraps ${c.wraps})` : ''}`,
    c.documented ? 'yes' : 'undocumented',
    (c.props.names.map((n) => (n in c.props.defaults ? `${n}=${JSON.stringify(c.props.defaults[n])}` : n)).join(', ') || '—') + (c.props.resolution === 'spread-from-import' || c.props.resolution === 'unresolved' ? ' (+ more, not statically resolved)' : ''),
    c.emits.join(', ') || '—', c.models.join(', ') || '—', c.slots.join(', ') || '—',
    c.variants ? Object.entries(c.variants.axes).map(([k, v]) => `${k}: ${v.join('|')}`).join('; ') : '—',
  ])))
  out.push('', `Rules: ${inv.barrel ? 'import from the barrel, never from a component file' : 'add an index.ts barrel under the root to define the public surface, then import only from it'}; colours, spacing, radii and shadows come from the tokens above, not literals; a data view renders loading, empty, error, partial and success; to go deeper than a wrapper allows, eject the component with the \`@ds-ejected\` marker and refresh its hash when you edit it.`)
  return out.join('\n')
}

export function run(argv) {
  const args = parseArgs(argv, { booleans: ['agents'] })
  if (args.help || !args._[0]) return usage(HELP)
  const root = resolve(args._[0])
  if (!existsSync(join(root, 'package.json'))) return fail(`no package.json in ${root}`)
  let config
  try { config = loadConfig(root, args.config, { exclude: excludeArg(args) }) } catch (error) { return fail(error.message) }
  const project = detectProject(root, config)
  const inv = inventory(project, args)
  if (inv.error) return fail(inv.error)
  if (args.agents) { process.stdout.write(`${agentsSection(inv, project)}\n`); return 0 }

  const report = createReport('design-system-inventory', project)
  report.analysis = { engine: 'lexical', requested: 'lexical', reason: 'v1 reads the SFCs lexically by design; props spread from imports and runtime variants are reported as partially resolved, not guessed' }
  for (const c of inv.components) {
    if (c.public && !c.documented) addFinding(report, { id: 'undocumented-public-component', level: 'confirmed', severity: 'low', file: c.file, line: 1, message: `${c.name} is exported from the barrel but has no doc comment, @example, .md or story`, fix: 'a leading <!-- --> comment with one sentence and an @example is enough for people and agents' })
    if (c.passThrough) addFinding(report, { id: 'pass-through-wrapper', level: 'confirmed', severity: 'medium', file: c.file, line: 1, message: `${c.name} re-exports ${c.wraps} with no props, emits, models or behaviour of its own`, fix: `use ${c.wraps} directly, or give the wrapper the project rule it exists for (a mandatory prop, a default, a behaviour)` })
    if (c.dataView?.missing.length) addFinding(report, { id: 'data-view-missing-states', level: 'heuristic', severity: 'medium', file: c.file, line: 1, message: `${c.name} renders fetched data but no ${c.dataView.missing.join(', ')} state was found (static signals only)`, fix: 'model the view as a discriminated union and render every state; verify by reading if a state lives in a parent' })
    if (c.ejected?.malformed) addFinding(report, { id: 'ejected-marker-malformed', level: 'confirmed', severity: 'low', file: c.file, line: 1, message: `${c.name} carries an @ds-ejected marker that is not well-formed (from, version and a 64-hex lowercase sha256 are required): drift cannot be checked`, fix: 'rewrite the first line as <!-- @ds-ejected from="<registry>/<name>" version="<v>" sha256="<hash of the file without this line>" -->' })
    if (c.ejected?.drifted) addFinding(report, { id: 'ejected-copy-drifted', level: 'confirmed', severity: 'medium', file: c.file, line: 1, message: `${c.name} was ejected from ${c.ejected.from}@${c.ejected.version} and edited since: the body no longer matches the marker's sha256`, fix: 'if the edit is intended, refresh the marker hash so the next reviewer knows the copy is owned; if not, re-eject' })
    if (c.props.resolution === 'spread-from-import' || c.props.resolution === 'unresolved') addFinding(report, { id: 'props-partially-resolved', level: 'info', severity: 'info', file: c.file, line: 1, message: `${c.name}: props ${c.props.resolution === 'spread-from-import' ? `spread from ${c.props.spreadFrom.join(', ')}` : 'built at runtime'}; the listed props are not the whole API`, fix: 'declare props inline when the component is public, or document the shared prop set next to it' })
  }
  const byLevel = { confirmed: 0, heuristic: 0, info: 0 }
  for (const f of report.findings) byLevel[f.level]++
  report.summary = {
    components: inv.components.length, public: inv.components.filter((c) => c.public).length,
    undocumentedPublic: inv.components.filter((c) => c.public && !c.documented).length,
    passThroughWrappers: inv.components.filter((c) => c.passThrough).length,
    ejected: inv.components.filter((c) => c.ejected).length, drifted: inv.components.filter((c) => c.ejected?.drifted).length,
    dataViews: inv.components.filter((c) => c.dataView).length, dataViewsMissingStates: inv.components.filter((c) => c.dataView?.missing.length).length,
    byLevel,
  }
  report.data = { library: inv.library, roots: inv.roots, barrel: inv.barrel, components: inv.components.map(({ passThrough, ...c }) => c), tokens: inv.tokens }
  const sections = [{ title: 'Components', table: { headers: ['component', 'owner', 'public', 'doc', 'props', 'emits', 'models', 'slots', 'variants', 'tokens', 'data view'], rows: inv.components.map((c) => [c.name + (c.layer ? ` (layer ${c.layer})` : ''), c.owner + (c.wraps ? ` → ${c.wraps}` : '') + (c.ejected ? ` ${c.ejected.drifted ? 'DRIFTED' : 'intact'}` : ''), c.public ? 'yes' : 'no', c.documented ? 'yes' : 'no', `${c.props.names.join(', ') || '—'}${c.props.resolution === 'declared' || c.props.resolution === 'declared-type' ? '' : ' (+?)'}`, c.emits.join(', ') || '—', c.models.join(', ') || '—', c.slots.join(', ') || '—', c.variants ? Object.keys(c.variants.axes).join(', ') : '—', `${c.tokens.used.length}${c.tokens.literals ? ` (+${c.tokens.literals} literal)` : ''}`, c.dataView ? (c.dataView.missing.length ? `missing ${c.dataView.missing.join('/')}` : 'five states') : '—']) } }]
  if (inv.tokens.unused.length) report.notes.push(`${inv.tokens.unused.length} declared token(s) used by no design-system component: ${inv.tokens.unused.join(', ')} (used elsewhere in the app, or dead)`)
  report.notes.push('Static level: the inventory reads the components, never renders them; literals are counted here and judged by design-consistency.mjs, markup accessibility by ui-audit.mjs. "documented" is presence, not quality.')
  return finish(report, args, { sections })
}

if (isMainModule(import.meta.url)) process.exitCode = run(process.argv.slice(2))
