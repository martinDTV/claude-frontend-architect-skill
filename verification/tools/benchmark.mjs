#!/usr/bin/env node
// Compares the lexical and semantic engines of domain-deps against fixtures with a hand-written ground truth,
// and optionally against another version of the scripts (--baseline <scripts-dir>, e.g. a `git archive` of a
// released tag). Edge-level precision/recall/F1 per fixture, symbol-level accuracy where a symbol truth exists,
// unknowns, fallbacks, time and heap. Everything runs in this process through buildGraph (read-only).
//   node benchmark.mjs                                   fixtures with ground truth
//   node benchmark.mjs --baseline /path/to/1.2.0/scripts  adds rows for that scripts tree (same fixtures)
//   node benchmark.mjs --real <project-root> [--config file] [--typescript dir] [--vue-compiler dir]
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fixtures, scriptsDir } from './helpers.mjs'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const vueProject = join(fixtures, '..', '..', 'vue')
const real = flag('real')
const overrides = { typescript: flag('typescript') ?? (real ? undefined : vueProject), vueCompiler: flag('vue-compiler') ?? (real ? undefined : vueProject) }

async function loadEngine(dir) {
  const { buildGraph } = await import(pathToFileURL(join(dir, 'lib', 'graph.mjs')).href)
  const { detectProject, loadConfig } = await import(pathToFileURL(join(dir, 'lib', 'project.mjs')).href)
  return { buildGraph, detectProject, loadConfig, dir }
}

function measure(eng, root, engine, extra = {}) {
  const project = eng.detectProject(root, eng.loadConfig(root, extra.config))
  if (global.gc) global.gc()
  const heapBefore = process.memoryUsage().heapUsed
  const t0 = performance.now()
  const graph = eng.buildGraph(project, { engine, typescript: engine === 'lexical' ? undefined : overrides.typescript, vueCompiler: engine === 'lexical' ? undefined : overrides.vueCompiler })
  const ms = Math.round(performance.now() - t0)
  const heapMb = Math.round(((process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024) * 10) / 10
  return { graph, ms, heapMb, engineUsed: graph.analysis?.engine ?? engine }
}

/** Runs a tool in a child process; returns its JSON report, wall time and the child's peak RSS (MB). */
function runToolMeasured(tool, argv) {
  const started = performance.now()
  const wrapper = `const { run } = await import(${JSON.stringify(pathToFileURL(join(scriptsDir, tool)).href)});
const chunks = []; const write = process.stdout.write.bind(process.stdout); process.stdout.write = (c) => { chunks.push(String(c)); return true };
await run(process.argv.slice(1)); process.stdout.write = write;
process.stderr.write('\\n__rss__' + process.resourceUsage().maxRSS); write(chunks.join(''))`
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', wrapper, '--', ...argv], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const ms = Math.round(performance.now() - started)
  const rssKb = Number((/__rss__(\d+)/.exec(res.stderr ?? '') ?? [])[1] ?? 0)
  // Node reports maxRSS in kilobytes on every platform
  const rssMb = Math.round(rssKb / 1024)
  let report = null
  try {
    report = JSON.parse(res.stdout)
  } catch {
    /* reported as error */
  }
  return { report, ms, rssMb, stderr: res.stderr }
}

const key = (e) => `${e.from} -> ${e.to} [${e.kind ?? 'runtime'}]`
const keyNoKind = (e) => `${e.from} -> ${e.to}`
const uniq = (list, fn) => [...new Set(list.map(fn))]
const pct = (x) => `${Math.round(x * 1000) / 10}%`

/** Edge-level score on unique (from, to, kind) pairs. */
function scoreEdges(expected, edges) {
  const found = new Set(edges.map(key))
  const want = new Set(expected.map(key))
  const tp = [...found].filter((k) => want.has(k)).length
  const fp = [...found].filter((k) => !want.has(k))
  const fn = [...want].filter((k) => !found.has(k))
  const precision = found.size ? tp / found.size : 1
  const recall = want.size ? tp / want.size : 1
  return { tp, fp, fn, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 }
}

/** Symbol-level score: expected origins (from, name → file, hops, status) against edge.origins. */
function scoreSymbols(truth, edges) {
  const got = new Map()
  for (const e of edges) for (const o of e.origins ?? []) got.set(`${e.from}#${o.name}`, o)
  let correct = 0
  const wrong = []
  for (const s of truth) {
    const o = got.get(`${s.from}#${s.name}`)
    const ok = o && o.status === (s.status ?? 'declared') && (o.file ?? null) === (s.file ?? null) && (s.hops === undefined || o.hops === s.hops)
    if (ok) correct++
    else wrong.push(`${s.from} ${s.name}: expected ${s.status ?? 'declared'} ${s.file ?? '-'} hops ${s.hops ?? '?'}, got ${o ? `${o.status} ${o.file ?? '-'} hops ${o.hops}` : 'nothing'}`)
  }
  return { total: truth.length, correct, wrong }
}

const current = await loadEngine(scriptsDir)
const baselineDir = flag('baseline')
const baseline = baselineDir ? await loadEngine(baselineDir) : null
// warm-up: load typescript and vue/compiler-sfc once, so no row pays module loading and rows are comparable
for (const eng of [current, baseline].filter(Boolean)) {
  try {
    measure(eng, real ?? join(fixtures, 'ts-paths'), 'semantic', { config: real ? flag('config') : undefined })
  } catch {
    /* reported in the table */
  }
}

if (real) {
  const config = flag('config')
  const results = {}
  for (const engine of ['lexical', 'semantic']) results[engine] = measure(current, real, engine, { config })
  console.log(`# Engine comparison on ${real}\n`)
  console.log('| engine | used | files | edges | runtime | type | verified | inferred | unknown symbols | unresolved imports | fallbacks | time ms | heap MB |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const [engine, r] of Object.entries(results)) {
    const edges = r.graph.edges
    const count = (pred) => edges.filter(pred).length
    console.log(`| ${engine} | ${r.engineUsed} | ${r.graph.files.size} | ${edges.length} | ${count((e) => (e.kind ?? 'runtime') === 'runtime')} | ${count((e) => e.kind === 'type')} | ${count((e) => e.confidence === 'verified')} | ${count((e) => e.confidence === 'inferred')} | ${r.graph.unknown.length} | ${(r.graph.unknownImports ?? []).length} | ${r.graph.analysis?.fallbacks?.length ?? 0} | ${r.ms} | ${r.heapMb} |`)
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
  if (a) console.log(`\nSemantic analysis: typescript ${a.typescript?.version} (${a.typescript?.source}); vue/compiler-sfc ${a.vueCompiler?.version ?? 'n/a'} (${a.vueCompiler?.source ?? 'n/a'}); resolution ${JSON.stringify(a.resolution)}; components ${JSON.stringify(a.componentResolution ?? {})}; symbols ${JSON.stringify(a.symbolResolution ?? {})}; workspace ${JSON.stringify(a.workspace ?? null)}; fallbacks ${a.fallbacks.length}`)
  if (results.semantic.graph.unknownImports?.length) {
    console.log(`\nUnresolved imports (semantic, first 10):`)
    for (const u of results.semantic.graph.unknownImports.slice(0, 10)) console.log(`- ${u.file}:${u.line} ${u.specifier ?? '(non-literal)'} (${u.reason})`)
  }
} else {
  const cases = [
    { name: 'ts-paths', root: join(fixtures, 'ts-paths') },
    { name: 'vue-templates', root: join(fixtures, 'vue-templates') },
    { name: 'monorepo', root: join(fixtures, 'monorepo') },
    { name: 'nuxt-app', root: join(fixtures, 'nuxt-app') },
    { name: 'next-app', root: join(fixtures, 'next-app') },
  ]
  console.log('# Lexical vs semantic on the fixtures with ground truth\n')
  console.log('| fixture | engine | used | edges | TP | FP | FN | precision | recall | F1 | unknown symbols | unresolved imports | time ms | heap MB | symbols ok | fallbacks | version |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  const details = []
  const engines = [{ label: '', eng: current }]
  if (baseline) engines.push({ label: ' (baseline)', eng: baseline })
  for (const c of cases) {
    const gtFile = join(c.root, 'expected-edges.json')
    const gt = existsSync(gtFile) ? JSON.parse(readFileSync(gtFile, 'utf8')) : null
    const symFile = join(c.root, 'expected-symbols.json')
    const symTruth = existsSync(symFile) ? JSON.parse(readFileSync(symFile, 'utf8')).origins : gt?.symbols ?? null
    for (const { label, eng } of engines) {
      for (const engine of ['lexical', 'semantic']) {
        let r
        try {
          r = measure(eng, c.root, engine)
        } catch (error) {
          console.log(`| ${c.name} | ${engine}${label} | error | ${String(error.message).slice(0, 60)} | | | | | | | | | | | | | |`)
          continue
        }
        const edges = r.graph.edges
        const s = gt ? scoreEdges(gt.edges, uniq(edges, key).map((k) => ({ from: k.split(' -> ')[0], to: k.split(' -> ')[1].split(' [')[0], kind: k.split(' [')[1].slice(0, -1) }))) : null
        const sym = symTruth && engine === 'semantic' ? scoreSymbols(symTruth, edges) : null
        const version = label ? 'baseline' : 'current'
        console.log(`| ${c.name} | ${engine}${label} | ${r.engineUsed} | ${edges.length} | ${s ? s.tp : '-'} | ${s ? s.fp.length : '-'} | ${s ? s.fn.length : '-'} | ${s ? pct(s.precision) : '-'} | ${s ? pct(s.recall) : '-'} | ${s ? pct(s.f1) : '-'} | ${r.graph.unknown.length} | ${(r.graph.unknownImports ?? []).length} | ${r.ms} | ${r.heapMb} | ${sym ? `${sym.correct}/${sym.total}` : '-'} | ${r.graph.analysis?.fallbacks?.length ?? 0} | ${version} |`)
        if (s && (s.fp.length || s.fn.length)) details.push({ fixture: c.name, engine: `${engine}${label}`, fp: s.fp, fn: s.fn })
        if (sym && sym.wrong.length) details.push({ fixture: c.name, engine: `${engine}${label}`, symbols: sym.wrong })
      }
    }
  }
  for (const d of details) {
    console.log(`\n${d.fixture} / ${d.engine}:`)
    for (const k of d.fn ?? []) console.log(`- false negative: ${k}`)
    for (const k of d.fp ?? []) console.log(`- false positive: ${k}`)
    for (const k of d.symbols ?? []) console.log(`- symbol: ${k}`)
  }
  // 1.4: rule-level precision of the static UI audit and the SSR rules against their hand-written truths,
  // per engine. The lexical rows are expected to be worse (no element tree, no AST context) and are kept so the
  // degradation is measured, not assumed. Each tool runs in a child process; RSS is the child's peak.
  console.log('\n# Rule-level precision on the fixtures with finding truths (1.4)\n')
  console.log('| fixture | tool | engine | expected | reported | TP | FP | FN | precision | recall | F1 | time ms | peak RSS MB |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  const ruleCases = [
    { name: 'ui-app', tool: 'ui-audit.mjs', root: join(fixtures, 'ui-app'), truth: 'expected-findings.json', pick: (t) => t.findings, filter: () => true, key: (f) => `${f.file}:${f.line} ${f.id} [${f.verification}]` },
    { name: 'ssr-app', tool: 'state-audit.mjs', root: join(fixtures, 'ssr-app'), truth: 'expected-ssr.json', pick: (t) => t.findings, filter: (f) => f.id === 'browser-api-in-setup' || f.id === 'nondeterministic-render', key: (f) => `${f.file}:${f.line} ${f.id} ${f.level}` },
  ]
  const ruleDetails = []
  for (const c of ruleCases) {
    const truth = c.pick(JSON.parse(readFileSync(join(c.root, c.truth), 'utf8')))
    for (const engine of ['lexical', 'semantic']) {
      const r = runToolMeasured(c.tool, [c.root, '--engine', engine, ...(engine === 'semantic' ? ['--typescript', vueProject, '--vue-compiler', vueProject] : []), '--json', '--fail-on', 'none'])
      if (!r.report) {
        console.log(`| ${c.name} | ${c.tool} | ${engine} | ${truth.length} | error | | | | | | | ${r.ms} | |`)
        continue
      }
      const got = uniq(r.report.findings.filter(c.filter), c.key)
      const want = new Set(truth.map(c.key))
      const tp = got.filter((k) => want.has(k)).length
      const fp = got.filter((k) => !want.has(k))
      const fn = [...want].filter((k) => !got.includes(k))
      const precision = got.length ? tp / got.length : 1
      const recall = want.size ? tp / want.size : 1
      const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0
      console.log(`| ${c.name} | ${c.tool} | ${engine} | ${want.size} | ${got.length} | ${tp} | ${fp.length} | ${fn.length} | ${pct(precision)} | ${pct(recall)} | ${pct(f1)} | ${r.ms} | ${r.rssMb} |`)
      if (fp.length || fn.length) ruleDetails.push({ name: c.name, engine, fp, fn })
    }
  }
  for (const d of ruleDetails) {
    console.log(`\n${d.name} / ${d.engine}:`)
    for (const k of d.fn) console.log(`- false negative: ${k}`)
    for (const k of d.fp) console.log(`- false positive: ${k}`)
  }
  console.log('\nRule-level truths: ui-app/expected-findings.json (finding, line and verification level) and ssr-app/expected-ssr.json (finding, line and level). The lexical engine has no element tree, so findings that need parents degrade to review and the SSR rules stay silent by design; those rows measure the degradation.')

  console.log('\nGround truth files: expected-edges.json in each fixture (unique from/to/kind pairs) and expected-symbols.json where symbol origins are asserted. Fixtures ship no node_modules; the semantic engine used the verification vue project\'s typescript and vue/compiler-sfc through overrides, as the tests do. Fixtures without a truth file (nuxt-app, next-app) report counts only. Times and heap are local measurements, not guarantees.')
}
