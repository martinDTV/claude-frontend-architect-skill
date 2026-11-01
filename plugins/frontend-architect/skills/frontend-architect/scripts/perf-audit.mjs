#!/usr/bin/env node
// Static performance intelligence (1.6 increment 1): patterns in the source that are *plausibly* costly to
// run or to ship, each reported with what is syntactically certain, what is only a hypothesis, and the
// measurement that would confirm a benefit before anyone optimises. It reuses the semantic engine
// (buildGraph) and the project conventions; it does not build, run or measure anything.
//
// The contract: a `confirmed` finding states a syntactic fact that is fully supported (an import is present,
// a key is a fresh value on every render) — it never means "the app is slow". A `heuristic` finding is a
// plausible risk to verify by reading and measuring. `info` is context. No finding recommends optimisation
// blindly; each names the measurement that would justify it (bundle-budget, coverage, the Performance panel,
// the future browser vitals check).
//
// Usage: perf-audit.mjs <project-root> [--json|--md] [--engine auto|semantic|lexical] [--exclude <globs>]
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildGraph } from './lib/graph.mjs'
import { detectProject, excludeArg, loadConfig } from './lib/project.mjs'
import { lineOf } from './lib/source.mjs'
import { ENGINE_HELP, addFinding, createReport, engineOptionsFrom, fail, finish, isMainModule, parseArgs, usage } from './lib/report.mjs'

const HELP = `
perf-audit — static performance patterns worth measuring, not confirmed slowdowns.

usage: node perf-audit.mjs <project-root> [options]
  --exclude <globs>   comma-separated project-relative globs to leave out (also "exclude" in .frontend-audit.json)
  --json | --md       output format
  --fail-on <level>   exit 1 on: confirmed | any | none (default confirmed)${ENGINE_HELP}

Every finding separates the syntactic fact (certain) from the performance risk (hypothesis) and names the
measurement that would confirm a benefit. 'confirmed' marks a fully supported syntactic fact only; it never
means the application is slow. Static analysis cannot see the bundle, the device or the render count: those
need bundle-budget, the build's coverage, the Performance panel, or the browser vitals check (1.6 inc. 2).

Detectors (React/Next and Vue/Nuxt), low-noise by design:
  heavy-static-import        a known-heavy client library imported statically (not dynamic, not type-only)
  provider-inline-value      a React Context Provider whose value is a fresh object/array/fn each render
  list-key-unstable          a React list key derived from Math.random()/Date.now() (confirmed) or the index (heuristic)
  computed-side-effect       a Vue computed getter that writes state or calls an effectful API
  reactive-deep-watch        a Vue watch over a whole reactive()/props object (implicit deep traversal)
When React Compiler is detected, the memoisation-identity advice (provider-inline-value) is downgraded to info.
`

// A small, documented set of modules whose client build is typically large. This is a SIGNAL for "measure the
// bundle", not a ban: the finding is heuristic, static imports only, and says to confirm with bundle-budget.
const HEAVY_MODULES = [
  { re: /^(chart\.js|chartjs-.*|apexcharts|vue-chartjs|react-chartjs-2|echarts|highcharts|plotly\.js.*|d3)(\/|$)/, why: 'charting libraries ship large runtimes' },
  { re: /^(three|@react-three\/.*|@tresjs\/.*|babylonjs.*|@babylonjs\/.*)(\/|$)/, why: '3D engines are among the largest client dependencies' },
  { re: /^(@monaco-editor\/.*|monaco-editor|@codemirror\/.*|codemirror|quill|@tiptap\/.*|draft-js|slate)(\/|$)/, why: 'editors bundle a large runtime' },
  { re: /^(pdfjs-dist|jspdf|pdfmake|@react-pdf\/.*|exceljs|xlsx)(\/|$)/, why: 'document/spreadsheet libraries are heavy' },
  { re: /^(moment|moment-timezone)(\/|$)/, why: 'moment is large and not tree-shakeable; luxon/date-fns/Temporal are lighter' },
  { re: /^lodash$/, why: 'importing the whole lodash defeats tree-shaking; import lodash-es members or per-method' },
  { re: /^(@fullcalendar\/.*|fullcalendar|gsap\/.*all.*|animejs|lottie-web|@lottiefiles\/.*)(\/|$)/, why: 'animation/calendar runtimes can be large on the client' },
]
const heavyHit = (src) => HEAVY_MODULES.find((m) => m.re.test(src))

// the balanced { … } starting at `open` (index of the '{'); null if unbalanced within a sane window
function balancedBlock(text, open, limit = 6000) {
  let depth = 0
  for (let i = open; i < text.length && i < open + limit; i++) {
    const c = text[i]
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return text.slice(open, i + 1) }
  }
  return null
}

const isReactFile = (info) => /\.(t|j)sx$/.test(info.rel)
const hasDirective = (info, name) => (info.semantic ? info.semantic.directives?.includes(name) : new RegExp(`^\\s*(?:\\/\\/[^\\n]*\\n|\\s)*['"]${name}['"]`).test(info.code))

// a file that cannot reach the client bundle: a Next.js server-only module, or a Nuxt server/ file. Heavy
// imports there do not ship to the browser, so they are not flagged.
function isServerOnly(project, info) {
  if (info.rel.startsWith('server/') || /\/server\//.test(info.rel)) return true
  if (/(^|\n)\s*import\s+['"]server-only['"]/.test(info.code)) return true
  if (project.framework === 'next') {
    // route handlers and server components without 'use client' are server by default, but a component
    // without the directive can still be imported into a client tree; we only treat explicit markers as server.
    if (/\.(ts|js)$/.test(info.rel) && /\/(route|middleware|proxy)\.(ts|js)$/.test(info.rel)) return true
  }
  return false
}

function detectReactCompiler(project) {
  const deps = { ...(project.pkg?.dependencies ?? {}), ...(project.pkg?.devDependencies ?? {}) }
  if (deps['babel-plugin-react-compiler'] || deps['eslint-plugin-react-compiler']) return 'dependency babel-plugin-react-compiler'
  // next.config: experimental.reactCompiler: true
  for (const name of ['next.config.ts', 'next.config.js', 'next.config.mjs']) {
    const p = join(project.root, name)
    if (existsSync(p)) {
      const t = readFileSync(p, 'utf8')
      if (/reactCompiler\s*:\s*true/.test(t)) return `${name}: experimental.reactCompiler`
    }
  }
  // vite react plugin babel config is harder to read reliably; dependency is the dependable signal.
  return null
}

const MEASURE = {
  bundle: 'confirm it reaches the startup bundle with bundle-budget.mjs on a real build and the build Coverage panel (transferred vs executed JS); a server-only or dynamically-imported module costs nothing on load',
  render: 'confirm it re-renders consumers with the React DevTools Profiler (why-did-you-render) on a production build; count renders before and after',
  remount: 'confirm the remount cost with the Performance panel; unnecessary remounts show as repeated mount work',
  compute: 'confirm the cost with the Performance panel under CPU throttling; a cheap getter over a small object is not worth changing',
}

function detectReact(report, project, info, reactCompiler) {
  const s = info.stripped
  // 1) heavy static import reachable by the client
  if (!isServerOnly(project, info)) {
    for (const imp of info.imports) {
      if (imp.kind !== 'static' || imp.typeOnly) continue
      const hit = heavyHit(imp.source)
      if (hit) addFinding(report, { id: 'heavy-static-import', level: 'heuristic', severity: 'medium', file: info.rel, line: imp.line, evidence: imp.source, message: `static import of "${imp.source}" (${hit.why})`, fix: `if this view is not always needed on load, import it dynamically (next/dynamic or React.lazy + Suspense) or move it to a server component; ${MEASURE.bundle}` })
    }
  }
  // 2) Context Provider with an inline fresh value (new identity each render → re-renders every consumer)
  for (const m of s.matchAll(/<([\w.]*(?:Provider|Context))\s+[^>]*\bvalue=\{\s*(\{|\[|\(|[\w$]+\s*=>|function\b|new\b)/g)) {
    const line = lineOf(s, m.index)
    if (reactCompiler) {
      addFinding(report, { id: 'provider-inline-value', level: 'info', severity: 'low', file: info.rel, line, evidence: m[1], message: `${m[1]} value is a fresh object/array/function each render, but React Compiler is enabled (${reactCompiler})`, fix: 'React Compiler memoises this automatically; no manual change needed. Verify with the Profiler only if consumers still re-render' })
    } else {
      addFinding(report, { id: 'provider-inline-value', level: 'heuristic', severity: 'medium', file: info.rel, line, evidence: m[1], message: `${m[1]} value is a fresh ${m[2].startsWith('{') ? 'object' : m[2].startsWith('[') ? 'array' : 'function'} literal on every render`, fix: `wrap the value in useMemo/useCallback so its identity is stable, or enable React Compiler; ${MEASURE.render}` })
    }
  }
  // 3) unstable list keys inside a .map(...)
  for (const m of s.matchAll(/\.map\s*\(([\s\S]{0,400}?)\)\s*[,)};\n]/g)) {
    const body = m[1]
    const randomKey = /\bkey=\{[^}]*\b(?:Math\.random|Date\.now|crypto\.randomUUID|performance\.now)\s*\(/.test(body)
    if (randomKey) {
      addFinding(report, { id: 'list-key-unstable', level: 'confirmed', severity: 'high', file: info.rel, line: lineOf(s, m.index), evidence: 'key={…Math.random()/Date.now()…}', message: 'list key is a fresh value on every render: every item remounts each render', fix: `use a stable id from the data as the key; ${MEASURE.remount}` })
      continue
    }
    const indexKey = /\bkey=\{\s*(?:i|idx|index|_?i)\s*\}/.test(body)
    if (indexKey) addFinding(report, { id: 'list-key-unstable', level: 'heuristic', severity: 'low', file: info.rel, line: lineOf(s, m.index), evidence: 'key={index}', message: 'list key is the array index: safe for a static list, but reorders/inserts/deletes reuse the wrong DOM and state', fix: `if the list can reorder or change length, key by a stable id from the data; a fixed list is fine as is (${MEASURE.remount})` })
  }
}

function detectVue(report, project, info) {
  const s = info.stripped
  // 1) heavy static import reachable by the client (Vue SFC scripts)
  if (!isServerOnly(project, info)) {
    for (const imp of info.imports) {
      if (imp.kind !== 'static' || imp.typeOnly) continue
      const hit = heavyHit(imp.source)
      if (hit) addFinding(report, { id: 'heavy-static-import', level: 'heuristic', severity: 'medium', file: info.rel, line: imp.line, evidence: imp.source, message: `static import of "${imp.source}" (${hit.why})`, fix: `if this view is not always needed on load, load it with defineAsyncComponent or a dynamic import, or render it client-only below the fold; ${MEASURE.bundle}` })
    }
  }
  // 2) computed() whose getter performs unambiguous I/O or emits. Only effectful APIs are flagged, never a
  // plain assignment: a getter that builds and mutates a LOCAL object (`const s = …; s.x = …; return s`) is a
  // pure, common pattern. The getter body is extracted with balanced braces so it never bleeds into later code.
  for (const m of s.matchAll(/\bcomputed\s*(?:<[^>]*>)?\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/g)) {
    const open = m.index + m[0].length - 1
    const body = balancedBlock(s, open)
    if (body == null) continue
    const io = /\bfetch\s*\(|\$fetch\s*\(|\bemit\s*\(|\blocalStorage\.|\bsessionStorage\.|\bdocument\.(?:getElementById|querySelector|cookie|write|createElement)|\bwindow\.(?:location|open|scrollTo)|\brouter\.(?:push|replace)\s*\(/.exec(body)
    if (io) addFinding(report, { id: 'computed-side-effect', level: 'heuristic', severity: 'medium', file: info.rel, line: lineOf(s, open), evidence: `computed getter calls ${io[0].replace(/[\s(].*$/, '')}`, message: 'computed getter performs I/O or navigation (fetch, emit, storage, DOM or router) instead of a pure derivation', fix: `a computed must be a pure derivation; move the effect to watch/watchEffect or an event handler. ${MEASURE.compute}` })
  }
  // 3) watch over a whole reactive()/props object → implicit deep traversal on every change
  for (const m of s.matchAll(/\bwatch\s*\(\s*([\w$.]+)\s*,/g)) {
    const src = m[1]
    const watchesReactiveWhole = new RegExp(`\\b(?:const|let)\\s+${src.replace('.', '\\.')}\\s*=\\s*reactive\\s*\\(`).test(s) || src === 'props'
    if (watchesReactiveWhole) addFinding(report, { id: 'reactive-deep-watch', level: 'heuristic', severity: 'low', file: info.rel, line: lineOf(s, m.index), evidence: `watch(${src}, …)`, message: `watch over the whole ${src === 'props' ? 'props' : 'reactive object'}: Vue traverses it deeply on every change`, fix: `watch the specific getter you depend on (watch(() => ${src}.field, …)) so only that field triggers; a small object is fine. ${MEASURE.compute}` })
  }
}

export function auditPerformance(project, options = {}) {
  const report = createReport('perf-audit', project)
  const graph = buildGraph(project, options)
  report.analysis = `engine: ${graph.files.values().next().value?.engine ?? 'lexical'}; files: ${graph.files.size}`
  const reactCompiler = detectReactCompiler(project)
  if (reactCompiler) report.notes = [...(report.notes ?? []), `React Compiler detected (${reactCompiler}): memoisation-identity findings are downgraded to info`]
  for (const info of graph.files.values()) {
    if (info.isVue) detectVue(report, project, info)
    else if (isReactFile(info)) detectReact(report, project, info, reactCompiler)
  }
  report.notes = [...(report.notes ?? []), 'Static analysis cannot confirm a slowdown: a confirmed finding is a certain syntactic fact, not a measured regression. Measure before optimising (bundle-budget.mjs, build Coverage, the Performance panel, and the browser vitals check planned for 1.6 increment 2).']
  return report
}

if (isMainModule(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args._[0]) usage(HELP)
  const root = resolve(args._[0])
  if (!existsSync(root)) fail(`not found: ${root}`)
  const config = loadConfig(root, args.config, { exclude: excludeArg(args) })
  const project = detectProject(root, config)
  const report = auditPerformance(project, engineOptionsFrom(args))
  process.exit(finish(report, args, {
    sections: [{ title: 'Performance patterns to measure', body: 'Each finding: the syntactic fact is certain; the performance impact is a hypothesis; the fix names the measurement that would confirm it. Nothing here is a measured slowdown.' }],
  }))
}
