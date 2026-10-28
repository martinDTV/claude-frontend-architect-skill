#!/usr/bin/env node
// Ranks components and pages by size and mixed responsibilities. Lexical metrics only; a
// high score means "read this file first", never "this file is wrong".
//
// Usage: component-complexity.mjs <project-root> [--top 20] [--threshold-lines 400] [--json|--md]
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildGraph } from './lib/graph.mjs'
import { detectProject, loadConfig } from './lib/project.mjs'
import { countMatches } from './lib/source.mjs'
import { ENGINE_HELP, addFinding, createReport, engineOptionsFrom, fail, finish, parseArgs, usage } from './lib/report.mjs'

const HELP = `
component-complexity — which components and pages carry too many responsibilities.

usage: node component-complexity.mjs <project-root> [options]
  --top <n>               files to list (default 20)
  --threshold-lines <n>   size above which a component is reported (default 400; 2x = high)
  --config <file>         classification file (default: .frontend-audit.json)
  --json | --md           output format
  --fail-on <level>       exit 1 on: confirmed | any | none (default confirmed; this tool emits heuristics only)${ENGINE_HELP}

With the semantic engine, .vue metrics (props, emits, refs, computed, watchers, lifecycle hooks,
template depth, components used) come from vue/compiler-sfc bindings and the template AST
(metricsSource: ast); otherwise from regular expressions (metricsSource: lexical).

Metrics per file: lines, script/template lines, reactive state, watchers/effects, HTTP calls,
composables/hooks, stores, modals, forms, tables, template depth; responsibility flags and a score.
`

const BUILTIN_COMPOSABLES = new Set(['useRoute', 'useRouter', 'useState', 'useHead', 'useSeoMeta', 'useNuxtApp', 'useRuntimeConfig', 'useId', 'useAttrs', 'useSlots', 'useTemplateRef', 'useCssModule', 'useFetch', 'useAsyncData', 'useLazyFetch', 'useLazyAsyncData', 'useCookie', 'useRequestHeaders', 'useRequestEvent', 'useRequestURL', 'useError', 'useNuxtData', 'useAppConfig', 'useLoadingIndicator', 'useRouteAnnouncer', 'usePreviewMode', 'useHydration', 'useEffect', 'useLayoutEffect', 'useMemo', 'useCallback', 'useRef', 'useContext', 'useReducer', 'useTransition', 'useDeferredValue', 'useActionState', 'useOptimistic', 'useFormStatus', 'useSyncExternalStore', 'useSearchParams', 'usePathname', 'useParams', 'useSelectedLayoutSegment', 'useI18n', 'useLocalePath', 'useSwitchLocalePath', 'useToast', 'useOverlay', 'useColorMode', 'useModel', 'useQueryClient'])

const HTTP_RE = /(?:\$fetch|useFetch|useLazyFetch|useAsyncData|useLazyAsyncData|apiFetch|useQuery|useMutation|useInfiniteQuery|fetch)\s*\(|\b(?:\$?api|http|axios|client|request|ky)\.(?:get|post|put|patch|delete|request)\s*\(/g

const STATE_CALLS = ['ref', 'reactive', 'shallowRef', 'shallowReactive', 'useState', 'useReducer']

export function metricsFor(info) {
  const s = info.stripped
  const t = info.template
  const code = info.code
  const composables = new Set()
  for (const m of s.matchAll(/\b(use[A-Z]\w*)\s*\(/g)) if (!BUILTIN_COMPOSABLES.has(m[1]) && !/Store$/.test(m[1])) composables.add(m[1])
  const stores = new Set([...s.matchAll(/\b(use\w+Store)\s*\(/g)].map((m) => m[1]))
  const props = info.isVue
    ? countMatches(/defineProps\s*<\s*\{([\s\S]*?)\}\s*>/.exec(code)?.[1] ?? /defineProps\s*\(\s*\{([\s\S]*?)\}\s*\)/.exec(code)?.[1] ?? '', /^\s*[\w$]+\??\s*:/gm)
    : countMatches(/interface\s+\w*Props\s*\{([\s\S]*?)\}/.exec(code)?.[1] ?? '', /^\s*[\w$]+\??\s*:/gm)
  const emits = countMatches(/defineEmits\s*<\s*\{([\s\S]*?)\}\s*>/.exec(code)?.[1] ?? '', /^\s*(?:[\w$]+|'[^']+'|"[^"]+")\s*[:(]/gm)
  const state = countMatches(s, /\b(?:ref|reactive|shallowRef|shallowReactive|useState|useReducer)\s*(?:<[^>]*>)?\s*\(/g)
  const computed = countMatches(s, /\b(?:computed|useMemo)\s*(?:<[^>]*>)?\s*\(/g)
  const watchers = countMatches(s, /\b(?:watch|watchEffect|watchPostEffect|watchSyncEffect|useEffect|useLayoutEffect)\s*\(/g)
  const httpCalls = countMatches(s, HTTP_RE)
  const functions = countMatches(s, /\bfunction\s+[\w$]+\s*\(|\bconst\s+[\w$]+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/g)
  const modals = countMatches(t, /<(?:U?Modal|U?Dialog|USlideover|Slideover|Drawer|Sheet|Popover|UPopover|Overlay)\b/g) + countMatches(code, /<(?:Dialog|Modal|Sheet|Drawer|AlertDialog)\b/g)
  const forms = countMatches(t, /<(?:form|UForm|Form)\b/g) + countMatches(code, /<form\b/g)
  const vModel = countMatches(t, /\bv-model(?:[:.][\w.-]+)?=/g) + countMatches(code, /\bonChange=/g)
  const tables = countMatches(t, /<(?:table|UTable|DataTable|VDataTable|Table)\b/g) + countMatches(code, /<(?:table|Table|DataTable)\b/g)
  const conditionals = countMatches(t, /\bv-(?:if|else-if|show)=/g)
  const realtime = /\b(?:EventSource|WebSocket|setInterval|useIntervalFn|useWebSocket|useEventSource)\b/.test(s)
  const files = /\b(?:FileReader|exceljs|xlsx|jspdf|pdfmake|new Blob|URL\.createObjectURL|input[^>]*type="file")\b/i.test(code + t)
  const charts = /\b(?:apexcharts|echarts|chart\.js|Chart\b|recharts|d3|unovis|highcharts|plotly)\b/i.test(code + t)
  const navigation = countMatches(s, /\b(?:router|navigateTo|redirect)\.?(?:push|replace|go)?\s*\(/g)
  const templateDepth = depthOf(t)
  const flags = []
  if (httpCalls > 0) flags.push('data-access')
  if (forms > 0 || vModel >= 5) flags.push('form')
  if (tables > 0) flags.push('table')
  if (modals >= 2) flags.push('modals')
  if (realtime) flags.push('realtime')
  if (files) flags.push('files')
  if (charts) flags.push('charts')
  if (navigation >= 3) flags.push('navigation')
  // AST-backed structural metrics replace the regex counts when the semantic engine parsed the file:
  //   ast         .vue parsed by vue/compiler-sfc (bindings + template AST)
  //   ast-script  .ts/.tsx parsed by TypeScript (calls and JSX tags; no template depth beyond the lexical count)
  //   lexical     regular expressions (v1.1)
  const sem = info.semantic
  const ast = sem?.sfc
  const callCount = (names) => names.reduce((n, c) => n + (sem.calls.get(c)?.length ?? 0), 0)
  const lifecycleLexical = countMatches(s, /\bon(?:Mounted|BeforeMount|BeforeUnmount|Unmounted|Activated|Deactivated|Updated)\s*\(/g)
  const structural = ast ? {
    props: ast.props ?? props, emits: ast.emits ?? emits, state: callCount(STATE_CALLS), computed: ast.computed ?? computed, watchers: ast.watchers ?? watchers,
    templateDepth: ast.templateDepth ?? templateDepth, componentsUsed: ast.templateComponents.length, lifecycleHooks: Object.keys(ast.lifecycle).length, imports: info.imports.length, metricsSource: 'ast',
  } : sem ? {
    props, emits, state: callCount(STATE_CALLS), computed: callCount(['computed', 'useMemo', 'useCallback']), watchers: callCount(['watch', 'watchEffect', 'watchPostEffect', 'watchSyncEffect', 'useEffect', 'useLayoutEffect']),
    templateDepth, componentsUsed: sem.jsxTags.size, lifecycleHooks: lifecycleLexical, imports: info.imports.length, metricsSource: 'ast-script',
  } : { props, emits, state, computed, watchers, templateDepth, componentsUsed: info.tags.size, lifecycleHooks: lifecycleLexical, imports: info.imports.length, metricsSource: 'lexical' }
  const score = Math.round(
    info.lines / 100 + structural.state / 5 + structural.watchers / 2 + httpCalls * 1.5 + modals * 1.5 + composables.size / 2 + stores.size + flags.length * 3 + Math.max(0, structural.templateDepth - 8),
  )
  return { lines: info.lines, scriptLines: info.scriptLines, templateLines: info.templateLines, ...structural, httpCalls, functions, modals, forms, vModel, tables, conditionals, composables: [...composables].sort(), stores: [...stores].sort(), flags, score }
}

const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'])
function depthOf(template) {
  let depth = 0
  let max = 0
  for (const m of template.matchAll(/<(\/)?([A-Za-z][\w.-]*)[^>]*?(\/)?>/g)) {
    const [, closing, tag, selfClosing] = m
    if (closing) depth = Math.max(0, depth - 1)
    else if (!selfClosing && !VOID.has(tag.toLowerCase())) {
      depth++
      max = Math.max(max, depth)
    }
  }
  return max
}

function isComponentFile(info) {
  if (info.isVue) return true
  if (!/\.[jt]sx$/.test(info.rel)) return false
  return /\breturn\s*\(?\s*</.test(info.code) || /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+[A-Z]/.test(info.code)
}

function isPage(rel) {
  return /(^|\/)pages\//.test(rel) || /(^|\/)app\/.*\/?page\.[jt]sx$/.test(rel) || /(^|\/)app\/page\.[jt]sx$/.test(rel)
}

function suggestions(m, rel) {
  const out = []
  if (m.httpCalls >= 2) out.push('move HTTP calls into a domain service + composable/hook')
  if (m.flags.includes('modals')) out.push(`extract ${m.modals} modals into their own components`)
  if (m.flags.includes('form') && (m.flags.includes('table') || m.flags.includes('modals'))) out.push('separate the form from the list/table view')
  if (m.watchers >= 6) out.push('replace watcher chains with computed values or event handlers')
  if (m.templateDepth > 10) out.push('flatten the template: extract repeated blocks and nested sections')
  if (isPage(rel) && m.httpCalls > 0) out.push('pages compose features; keep data access in the feature')
  if (m.stores.length >= 3) out.push('too many stores touched: a composable should coordinate them')
  return out
}

export function run(argv) {
  const args = parseArgs(argv)
  if (args.help || !args._[0]) return usage(HELP)
  const root = resolve(args._[0])
  if (!existsSync(join(root, 'package.json'))) return fail(`no package.json in ${root}`)
  const project = detectProject(root, loadConfig(root, args.config))
  const report = createReport('component-complexity', project)
  const threshold = Number(args['threshold-lines'] ?? 400)
  const top = Number(args.top ?? 20)

  const rows = []
  let graph
  try {
    graph = buildGraph(project, { autoImports: false, ...engineOptionsFrom(args) })
  } catch (error) {
    return fail(error.message)
  }
  report.analysis = graph.analysis
  for (const info of graph.files.values()) {
    if (!isComponentFile(info)) continue
    const m = metricsFor(info)
    rows.push({ file: info.rel, page: isPage(info.rel), domain: info.classification.domain, ...m, suggestions: suggestions(m, info.rel) })
  }
  rows.sort((a, b) => b.score - a.score || b.lines - a.lines)

  for (const r of rows) {
    if (r.lines >= threshold) {
      addFinding(report, {
        id: 'oversized-component', level: 'heuristic', severity: r.lines >= threshold * 2 ? 'high' : 'medium', file: r.file,
        message: `${r.lines} lines (${r.scriptLines} script, ${r.templateLines} template); flags: ${r.flags.join(', ') || 'none'}`,
        fix: r.suggestions.join('; ') || 'split by responsibility',
      })
    }
    const mixed = r.flags.filter((f) => f !== 'navigation')
    if (mixed.length >= 3) {
      addFinding(report, {
        id: 'mixed-responsibilities', level: 'heuristic', severity: 'medium', file: r.file,
        message: `${mixed.length} responsibilities in one file: ${mixed.join(', ')} (http calls ${r.httpCalls}, modals ${r.modals}, forms ${r.forms}, tables ${r.tables})`,
        fix: r.suggestions.join('; '),
      })
    }
    if (r.page && r.httpCalls >= 3) {
      addFinding(report, { id: 'page-talks-to-network', level: 'heuristic', severity: 'low', file: r.file, message: `page with ${r.httpCalls} direct data calls`, fix: 'in a feature-based app the page composes; the feature owns services and composables' })
    }
    if (r.watchers >= 6) addFinding(report, { id: 'watcher-chains', level: 'heuristic', severity: 'low', file: r.file, message: `${r.watchers} watchers/effects`, fix: 'derive with computed; react to user events in handlers; keep effects for external systems' })
    if (r.templateDepth > 12 || r.templateLines > 600) addFinding(report, { id: 'god-template', level: 'heuristic', severity: 'medium', file: r.file, message: `template depth ${r.templateDepth}, ${r.templateLines} template lines`, fix: 'extract sections into child components' })
  }

  const total = rows.reduce((n, r) => n + r.lines, 0)
  report.summary = {
    components: rows.length,
    totalLines: total,
    over: `${rows.filter((r) => r.lines >= threshold).length} files >= ${threshold} lines`,
    medianLines: rows.length ? [...rows].sort((a, b) => a.lines - b.lines)[Math.floor(rows.length / 2)].lines : 0,
    largest: rows.length ? `${[...rows].sort((a, b) => b.lines - a.lines)[0].file} (${Math.max(...rows.map((r) => r.lines))} lines)` : '-',
  }
  report.data = { threshold, components: rows }
  const sections = [{
    title: `Top ${top} by score (heuristic: size, state, watchers, HTTP, modals, composables, responsibilities)`,
    table: {
      headers: ['score', 'lines', 'script', 'tpl', 'state', 'watch', 'http', 'modals', 'comps', 'src', 'flags', 'file'],
      rows: rows.slice(0, top).map((r) => [r.score, r.lines, r.scriptLines, r.templateLines, r.state, r.watchers, r.httpCalls, r.modals, r.composables.length, r.metricsSource === 'ast' ? 'ast' : r.metricsSource === 'ast-script' ? 'ast-s' : 'lex', r.flags.join(','), r.file]),
    },
  }]
  return finish(report, args, { sections })
}

// Set the exit code instead of calling process.exit: large --json outputs piped to another process
// would otherwise be truncated at 64 KiB when the process exits before stdout drains.
if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = run(process.argv.slice(2))
