// Structural analysis of a Vue single-file component with the project's own `vue/compiler-sfc`
// (parse + compileScript: compilation only, nothing executed) and TypeScript's parser for the script
// blocks and for template expressions. Falls back per file when the compiler rejects the source.
import { expressionIdentifiers, parseModule } from './ts-module.mjs'

const NodeTypes = { ELEMENT: 1, INTERPOLATION: 5, SIMPLE_EXPRESSION: 4, DIRECTIVE: 7, COMPOUND: 8, IF: 9, IF_BRANCH: 10, FOR: 11 }
const ElementTypes = { ELEMENT: 0, COMPONENT: 1, SLOT: 2, TEMPLATE: 3 }
const LIFECYCLE = new Set(['onMounted', 'onBeforeMount', 'onBeforeUnmount', 'onUnmounted', 'onActivated', 'onDeactivated', 'onUpdated', 'onBeforeUpdate', 'onErrorCaptured', 'onServerPrefetch', 'onScopeDispose', 'onRenderTracked', 'onRenderTriggered'])

function walkTemplate(ast, visit) {
  const stack = [{ node: ast, depth: 0, parents: [] }]
  while (stack.length) {
    const { node, depth, parents } = stack.pop()
    if (!node || typeof node !== 'object') continue
    visit(node, depth, parents)
    const children = []
    if (Array.isArray(node.children)) children.push(...node.children)
    if (Array.isArray(node.branches)) children.push(...node.branches)
    if (node.type === NodeTypes.IF_BRANCH && Array.isArray(node.children)) children.push(...node.children)
    const nextParents = node.type === NodeTypes.ELEMENT ? [node, ...parents] : parents
    // pushed in reverse so the stack pops them in document order (heading sequence, label-before-control checks rely on it)
    for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i], depth: node.type === NodeTypes.ELEMENT ? depth + 1 : depth, parents: nextParents })
  }
}

const NodeTypesText = { TEXT: 2, INTERPOLATION: 5, COMPOUND: 8 }
/** Element record for the UI audit: static attributes, bound attributes, events, directives, text, parents. */
function elementRecord(node, parents) {
  const attrs = {}
  const bound = {}
  const events = []
  const eventHandlers = {}
  const eventModifiers = {}
  const directives = []
  for (const prop of node.props ?? []) {
    if (prop.type === NodeTypes.DIRECTIVE) {
      if (prop.name === 'bind' && prop.arg?.content) bound[prop.arg.content] = prop.exp?.content ?? ''
      else if (prop.name === 'on' && prop.arg?.content) {
        events.push(prop.arg.content)
        eventHandlers[prop.arg.content] = (prop.exp?.content ?? '').trim()
        eventModifiers[prop.arg.content] = (prop.modifiers ?? []).map((m) => (typeof m === 'string' ? m : m.content))
      } else if (prop.name === 'model') directives.push(`v-model${prop.arg?.content ? `:${prop.arg.content}` : ''}`)
      else directives.push(`v-${prop.name}${prop.arg?.content ? `:${prop.arg.content}` : ''}`)
    } else attrs[prop.name] = prop.value?.content ?? true
  }
  const children = node.children ?? []
  // text and child tags are collected through the whole subtree: an accessible name comes from any descendant
  // text ("name from content"), and a component anywhere inside may render one
  let hasText = false
  const childTags = []
  const visitDeep = (list) => {
    for (const c of list) {
      if ((c.type === NodeTypesText.TEXT && c.content.trim()) || c.type === NodeTypesText.INTERPOLATION || c.type === NodeTypesText.COMPOUND) hasText = true
      if (c.type === NodeTypes.ELEMENT) childTags.push(c.tag)
      if (Array.isArray(c.children)) visitDeep(c.children)
      if (Array.isArray(c.branches)) visitDeep(c.branches)
    }
  }
  visitDeep(children)
  const hasSlot = childTags.includes('slot') || children.some((c) => c.type === NodeTypes.ELEMENT && c.tagType === ElementTypes.SLOT)
  return { tag: node.tag, line: node.loc.start.line, isComponent: node.tagType === ElementTypes.COMPONENT, attrs, bound, events, eventHandlers, eventModifiers, directives, hasText, hasSlot, childTags, parents: parents.map((p) => p.tag), depth: parents.length }
}

/**
 * Returns a module-like record (same fields as parseModule) plus `sfc` details, or `{ error }`.
 * Lines are absolute within the .vue file.
 */
export function parseSfc(sfcCompiler, ts, text, fileName) {
  let descriptor
  try {
    const parsed = sfcCompiler.parse(text, { filename: fileName, sourceMap: false })
    descriptor = parsed.descriptor
    if (parsed.errors?.length && !descriptor) return { error: String(parsed.errors[0]) }
  } catch (error) {
    return { error: `compiler-sfc parse failed: ${error?.message ?? error}` }
  }
  const blocks = [descriptor.scriptSetup, descriptor.script].filter(Boolean)
  const lang = blocks[0]?.lang ?? 'js'
  const merged = { imports: [], exports: [], directives: [], declared: new Set(), valueIdentifiers: new Map(), typeIdentifiers: new Map(), calls: new Map(), memberCalls: [], jsxTags: new Map(), jsxElements: [], browserApiUses: [], parseDiagnostics: 0 }
  let scriptStartLine = 0
  for (const block of blocks) {
    const offset = (block.loc?.start?.line ?? 1) - 1
    if (!scriptStartLine) scriptStartLine = offset + 1
    let info
    try {
      info = parseModule(ts, block.content, `${fileName}.${lang === 'tsx' ? 'tsx' : lang === 'ts' ? 'ts' : 'js'}`, { lang })
    } catch (error) {
      return { error: `script block parse failed: ${error?.message ?? error}` }
    }
    const shift = (entry) => ({ ...entry, line: entry.line + offset })
    merged.imports.push(...info.imports.map(shift))
    merged.exports.push(...info.exports.map(shift))
    merged.directives.push(...info.directives)
    for (const n of info.declared) merged.declared.add(n)
    for (const [k, v] of info.valueIdentifiers) if (!merged.valueIdentifiers.has(k)) merged.valueIdentifiers.set(k, v + offset)
    for (const [k, v] of info.typeIdentifiers) if (!merged.typeIdentifiers.has(k)) merged.typeIdentifiers.set(k, v + offset)
    for (const [k, lines] of info.calls) merged.calls.set(k, [...(merged.calls.get(k) ?? []), ...lines.map((l) => l + offset)])
    merged.memberCalls.push(...info.memberCalls.map(shift))
    merged.jsxElements.push(...(info.jsxElements ?? []).map(shift))
    merged.browserApiUses.push(...(info.browserApiUses ?? []).map(shift))
    merged.parseDiagnostics += info.parseDiagnostics
  }

  // template: component tags, expressions, depth, `<component :is>` targets
  const templateComponents = new Map()
  const templateIdentifiers = new Map()
  const componentUses = [] // { tag, line, how: 'tag' | 'is-static' | 'is-literal' }
  const elements = [] // every template element with its attributes (UI audit)
  const dynamicComponents = [] // { line, expression } for `<component :is="expr">` with a non-literal expression
  const useComponent = (tag, line, how) => {
    if (!tag) return
    if (!templateComponents.has(tag)) templateComponents.set(tag, [])
    templateComponents.get(tag).push(line)
    componentUses.push({ tag, line, how })
  }
  let depth = 0
  let elementCount = 0
  const templateLine = descriptor.template?.loc?.start?.line ?? 0
  const exprLine = (node) => (node?.loc?.start?.line ?? templateLine)
  const addExpr = (content, line) => {
    if (!content || typeof content !== 'string') return
    for (const [name] of expressionIdentifiers(ts, content)) if (!templateIdentifiers.has(name)) templateIdentifiers.set(name, line)
  }
  if (descriptor.template?.ast) {
    walkTemplate(descriptor.template.ast, (node, d, parents) => {
      if (node.type === NodeTypes.ELEMENT) {
        elementCount++
        depth = Math.max(depth, d + 1)
        elements.push(elementRecord(node, parents))
        if (node.tagType === ElementTypes.COMPONENT) {
          const tag = node.tag
          if (tag === 'component' || tag === 'Component') {
            // the real target lives in `is`: a static attribute, a string literal, or an expression
            const isAttr = (node.props ?? []).find((p) => p.type !== NodeTypes.DIRECTIVE && p.name === 'is')
            const isBind = (node.props ?? []).find((p) => p.type === NodeTypes.DIRECTIVE && p.name === 'bind' && p.arg?.content === 'is')
            if (isAttr?.value?.content) useComponent(isAttr.value.content.replace(/^vue:/, ''), node.loc.start.line, 'is-static')
            else if (isBind?.exp?.content) {
              const expr = isBind.exp.content.trim()
              // string literals that name a component: PascalCase or kebab-case; lowercase words are HTML elements or data
              const literals = [...expr.matchAll(/(["'`])([A-Za-z][\w-]*)\1/g)].map((m) => m[2]).filter((name) => /^[A-Z]/.test(name) || name.includes('-'))
              const onlyLiterals = /^(["'`])[A-Za-z][\w-]*\1$/.test(expr)
              for (const name of literals) useComponent(name, node.loc.start.line, 'is-literal')
              if (!onlyLiterals) dynamicComponents.push({ line: node.loc.start.line, expression: expr.slice(0, 80) })
            } else dynamicComponents.push({ line: node.loc.start.line, expression: '(no is attribute)' })
            useComponent('component', node.loc.start.line, 'tag')
          } else useComponent(tag, node.loc.start.line, 'tag')
        }
        for (const prop of node.props ?? []) {
          if (prop.type === NodeTypes.DIRECTIVE) {
            if (prop.exp?.content) addExpr(prop.name === 'for' ? prop.exp.content.replace(/^.*?\b(?:in|of)\b/, '') : prop.exp.content, prop.loc.start.line)
            if (prop.arg?.content && prop.arg.isStatic === false) addExpr(prop.arg.content, prop.loc.start.line)
          }
        }
      } else if (node.type === NodeTypes.INTERPOLATION && node.content?.content) addExpr(node.content.content, exprLine(node))
    })
  }

  // bindings and structural facts from compileScript (compilation only)
  let bindings = null
  let compileError = null
  try {
    if (blocks.length) {
      const compiled = sfcCompiler.compileScript(descriptor, { id: 'audit', sourceMap: false })
      bindings = compiled.bindings ?? null
    }
  } catch (error) {
    compileError = error?.message ?? String(error)
  }
  const countBindings = (types) => (bindings ? Object.values(bindings).filter((t) => types.includes(t)).length : null)
  const callCount = (name) => (merged.calls.get(name) ?? []).length
  const sfc = {
    setup: Boolean(descriptor.scriptSetup),
    lang,
    scriptStartLine,
    templateLine,
    templateComponents: new Map([...templateComponents].map(([tag, lines]) => [tag, lines.sort((a, b) => a - b)])),
    componentUses,
    dynamicComponents,
    templateIdentifiers,
    templateDepth: depth,
    templateElements: elementCount,
    elements,
    bindings,
    props: countBindings(['props', 'props-aliased']),
    setupRefs: countBindings(['setup-ref', 'setup-let', 'setup-reactive-const']),
    setupConsts: countBindings(['setup-const', 'setup-maybe-ref']),
    emits: callCount('defineEmits'),
    exposes: callCount('defineExpose'),
    models: callCount('defineModel'),
    lifecycle: Object.fromEntries([...merged.calls].filter(([k]) => LIFECYCLE.has(k)).map(([k, v]) => [k, v.length])),
    watchers: callCount('watch') + callCount('watchEffect') + callCount('watchPostEffect') + callCount('watchSyncEffect'),
    computed: callCount('computed'),
    compileError,
    styles: descriptor.styles?.length ?? 0,
  }
  return { ...merged, sfc, scriptContent: blocks.map((b) => b.content).join('\n'), templateContent: descriptor.template?.content ?? '' }
}
