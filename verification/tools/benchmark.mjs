#!/usr/bin/env node
// Compares the lexical (v1.1) and semantic (v1.2) engines of domain-deps.
//   node benchmark.mjs                       fixtures with ground truth: precision, recall, unknowns, time, memory
//   node benchmark.mjs --real <project-root> [--config file] [--typescript dir] [--vue-compiler dir]
//                                            a real project: edge counts by confidence/kind, diff between engines
// Everything runs in this process through buildGraph (read-only); memory is the heap delta around the build.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fixtures, scriptsDir } from './helpers.mjs'

const { buildGraph } = await import(join(scriptsDir, 'lib', 'graph.mjs'))
const { detectProject, loadConfig } = await import(join(scriptsDir, 'lib', 'project.mjs'))

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const vueProject = join(fixtures, '..', '..', 'vue')
// fixtures ship no node_modules, so they borrow typescript and vue/compiler-sfc from the verification vue project;
// a real project (--real) is analysed with its own installed packages unless --typescript / --vue-compiler say otherwise
const real = flag('real')
const overrides = { typescript: flag('typescript') ?? (real ? undefined : vueProject), vueCompiler: flag('vue-compiler') ?? (real ? undefined : vueProject) }

function measure(root, engine, extra = {}) {
  const project = detectProject(root, loadConfig(root, extra.config))
  if (global.gc) global.gc()
  const heapBefore = process.memoryUsage().heapUsed
  const t0 = performance.now()
  const graph = buildGraph(project, { engine, typescript: engine === 'lexical' ? undefined : overrides.typescript, vueCompiler: engine === 'lexical' ? undefined : overrides.vueCompiler })
  const ms = Math.round(performance.now() - t0)
  const heapMb = Math.round(((process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024) * 10) / 10
  return { graph, ms, heapMb, engineUsed: graph.analysis?.engine ?? engine }
}

const key = (e) => `${e.from} -> ${e.to} [${e.kind ?? 'runtime'}]`
const keyNoKind = (e) => `${e.from} -> ${e.to}`

function scoreAgainst(expected, edges, scope) {
  const inScope = (e) => !scope || scope.includes(e.from)
  const found = new Set(edges.filter(inScope).map(key))
  const want = new Set(expected.map(key))
  const tp = [...found].filter((k) => want.has(k)).length
  const fp = [...found].filter((k) => !want.has(k))
  const fn = [...want].filter((k) => !found.has(k))
  const precision = found.size ? tp / found.size : 1
  const recall = want.size ? tp / want.size : 1
  return { tp, fp, fn, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 }
}

const pct = (x) => `${Math.round(x * 1000) / 10}%`

if (real) {
  const root = real
  const config = flag('config')
  const results = {}
  for (const engine of ['lexical', 'semantic']) results[engine] = measure(root, engine, { config })
  console.log(`# Engine comparison on ${root}\n`)
  console.log('| engine | used | files | edges | runtime | type | verified | inferred | unknown symbols | unresolved imports | time ms | heap MB |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const [engine, r] of Object.entries(results)) {
    const edges = r.graph.edges
    const count = (pred) => edges.filter(pred).length
    console.log(`| ${engine} | ${r.engineUsed} | ${r.graph.files.size} | ${edges.length} | ${count((e) => (e.kind ?? 'runtime') === 'runtime')} | ${count((e) => e.kind === 'type')} | ${count((e) => e.confidence === 'verified')} | ${count((e) => e.confidence === 'inferred')} | ${r.graph.unknown.length} | ${(r.graph.unknownImports ?? []).length} | ${r.ms} | ${r.heapMb} |`)
  }
  const lex = new Map(results.lexical.graph.edges.map((e) => [keyNoKind(e), e]))
  const sem = new Map(results.semantic.graph.edges.map((e) => [keyNoKind(e), e]))
  const onlyLex = [...lex.keys()].filter((k) => !sem.has(k))
  const onlySem = [...sem.keys()].filter((k) => !lex.has(k))
  console.log(`\nEdges (from → to, ignoring kind): both ${[...lex.keys()].filter((k) => sem.has(k)).length}, only lexical ${onlyLex.length}, only semantic ${onlySem.length}`)
  const show = (title, keys, map) => {
    if (!keys.length) return
    console.log(`\n${title} (first 12):`)
    for (const k of keys.slice(0, 12)) {
      const e = map.get(k)
      console.log(`- ${k} (${e.via}, ${e.resolution ?? 'lexical'}, ${e.specifier ?? e.name})`)
    }
  }
  show('Only lexical', onlyLex, lex)
  show('Only semantic', onlySem, sem)
  const a = results.semantic.graph.analysis
  if (a) console.log(`\nSemantic analysis: typescript ${a.typescript?.version} (${a.typescript?.source}); vue/compiler-sfc ${a.vueCompiler?.version ?? 'n/a'} (${a.vueCompiler?.source ?? 'n/a'}); resolution ${JSON.stringify(a.resolution)}; fallbacks ${a.fallbacks.length}`)
  if (results.semantic.graph.unknownImports?.length) {
    console.log(`\nUnresolved imports (semantic, first 10):`)
    for (const u of results.semantic.graph.unknownImports.slice(0, 10)) console.log(`- ${u.file}:${u.line} ${u.specifier ?? '(non-literal)'} (${u.reason})`)
  }
} else {
  const cases = [
    { name: 'ts-paths', root: join(fixtures, 'ts-paths') },
    { name: 'nuxt-app', root: join(fixtures, 'nuxt-app') },
    { name: 'next-app', root: join(fixtures, 'next-app') },
  ]
  console.log('# Lexical vs semantic on the fixtures with ground truth\n')
  console.log('| fixture | engine | used | edges | TP | FP | FN | precision | recall | F1 | unknown symbols | unresolved imports | time ms | heap MB |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  const details = []
  for (const c of cases) {
    const gtFile = join(c.root, 'expected-edges.json')
    const gt = existsSync(gtFile) ? JSON.parse(readFileSync(gtFile, 'utf8')) : null
    for (const engine of ['lexical', 'semantic']) {
      const r = measure(c.root, engine)
      const edges = r.graph.edges
      const s = gt ? scoreAgainst(gt.edges, edges, gt.scope) : null
      console.log(`| ${c.name} | ${engine} | ${r.engineUsed} | ${edges.length} | ${s ? s.tp : '-'} | ${s ? s.fp.length : '-'} | ${s ? s.fn.length : '-'} | ${s ? pct(s.precision) : '-'} | ${s ? pct(s.recall) : '-'} | ${s ? pct(s.f1) : '-'} | ${r.graph.unknown.length} | ${(r.graph.unknownImports ?? []).length} | ${r.ms} | ${r.heapMb} |`)
      if (s && (s.fp.length || s.fn.length)) details.push({ fixture: c.name, engine, fp: s.fp, fn: s.fn })
    }
  }
  for (const d of details) {
    console.log(`\n${d.fixture} / ${d.engine}:`)
    for (const k of d.fn) console.log(`- false negative: ${k}`)
    for (const k of d.fp) console.log(`- false positive: ${k}`)
  }
  console.log('\nGround truth files: expected-edges.json in each fixture (edges restricted to `scope` when present). Fixtures ship no node_modules; the semantic engine used the verification vue project\'s typescript and vue/compiler-sfc through overrides, as the tests do.')
}
