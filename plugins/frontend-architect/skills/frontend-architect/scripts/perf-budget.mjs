#!/usr/bin/env node
// Performance budgets and verified optimization (1.6 increment 5). A pure evaluator: it reads the JSON the existing
// tools already emit (route-attribution, browser-audit's vitals/interactions/hydration-cost, bundle-budget) and applies
// one typed budget contract. It never measures, never builds, never drives a browser — it is not a second auditor, a
// second engine, or a second budget system; it aggregates and judges results that were produced elsewhere.
//
// Two modes:
//   evaluate  perf-budget.mjs --budget <budget.json> --results <a.json,b.json,...> [--json|--md] [--fail-on ...]
//   compare   perf-budget.mjs --compare <before.json> <after.json> [--budget <budget.json>] [--json|--md]
//
// Every evaluation yields one typed state, never a silent zero and never "no data = fast":
//   PASS, FAIL, UNAVAILABLE (the metric was not emitted / the check was not run),
//   INSUFFICIENT_DATA (fewer than minSamples valid runs), INVALID_CONFIGURATION (a bad budget entry or an
//   incompatible before/after pair). A FAIL is a measured breach backed by the metric's contract and its evidence.
//
// Six budget categories, never summed or compared across kinds (gzip build bytes, transferred bytes, ms and a CLS
// score are different magnitudes): build, route, network, experience, diagnostic, and the unavailable signals.
import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { addFinding, createReport, fail, finish, isMainModule, parseArgs, usage } from './lib/report.mjs'

const HELP = `
perf-budget — evaluate performance budgets and verify optimizations from existing audit results (no measuring).

usage:
  node perf-budget.mjs --budget <file> --results <a.json,b.json,...> [--json|--md] [--fail-on confirmed|any|none]
  node perf-budget.mjs --compare <before.json> <after.json> [--budget <file>] [--json|--md]

It reads the JSON reports of:
  route-attribution.mjs   per-route initial client JS/CSS, shared chunks, strategy (build evidence)
  browser-audit.mjs       vitals (LCP/CLS/FCP/TTFB/long tasks), interactions (lab latency), hydration-cost (proxies)
  bundle-budget.mjs       entry/total/max-chunk sizes (build evidence)

Budget file: a JSON array of entries. Each entry:
  { "route": "/app/shipments" | "*",   // route path, or * for every route
    "category": "build|route|network|experience|diagnostic",
    "metric": "initialClientJsKb" | "lcp" | "cls" | "interaction:open menu" | "hydration:toLoad" | ...,
    "unit": "kb|ms|score|count|bytes",
    "threshold": 180,
    "source": "route-attribution|vitals|interactions|hydration-cost|bundle",
    "profile": "desktop-no-throttle",   // optional; must match the result's measurement profile when given
    "minSamples": 3,                     // optional; lab metrics below this are INSUFFICIENT_DATA
    "onMissing": "unavailable|insufficient|fail",  // default unavailable; opt-in checks never fail by absence
    "severity": "high|medium|low",
    "failOn": true }                     // whether a breach of THIS entry contributes to a non-zero exit

States: PASS, FAIL, UNAVAILABLE, INSUFFICIENT_DATA, INVALID_CONFIGURATION. Exit: 0 nothing to fail on; 1 a failOn
budget is FAIL and --fail-on makes it count (default: a confirmed FAIL); 2 the tool could not run.

Compare: before/after must share route, category, metric, unit and measurement profile, and each lab metric must have
minSamples valid runs, or the comparison is INVALID_CONFIGURATION / INSUFFICIENT_DATA — a verdict (improved /
regressed / inconclusive) is only given for a compatible, sufficiently-sampled pair, with absolute and percent change
and the dispersion. It never claims causality from two different numbers.
`

const round = (x, n = 1) => (x == null ? null : Math.round(x * 10 ** n) / 10 ** n)
const pct = (before, after) => (before === 0 ? null : round(((after - before) / before) * 100, 1))

// ---- reading the existing tool reports into a normalized lookup ------------------------------------------------
// Each reader returns measurements keyed by `${route}\u0000${metric}` -> { value, unit, samples, available, cause,
// profile, evidence, confidence, kind }. A missing metric is simply absent (the evaluator turns absence into a state).
function indexResults(reports) {
  const idx = new Map()
  const put = (route, metric, m) => idx.set(`${route}\u0000${metric}`, m)
  for (const rep of reports) {
    if (!rep || typeof rep !== 'object') continue
    if (rep.tool === 'route-attribution') readRouteAttribution(rep, put)
    else if (rep.tool === 'browser-audit') readBrowserAudit(rep, put)
    else if (rep.tool === 'bundle-budget') readBundleBudget(rep, put)
    // unknown tool reports are ignored (not an error): a budget referencing their metrics will report UNAVAILABLE
  }
  return idx
}

function readRouteAttribution(rep, put) {
  for (const r of rep.data?.routes ?? []) {
    const a = r.attribution ?? {}
    const unavailable = a.confidence === 'unavailable'
    const base = { available: !unavailable, cause: unavailable ? (a.reason ?? 'route attribution unavailable for this route') : null, samples: null, profile: 'build', evidence: a.source ?? null, confidence: a.confidence ?? null, kind: 'build-evidence' }
    put(r.route, 'initialClientJsKb', { ...base, value: a.initialClientJs?.gzipKb ?? null, unit: 'kb' })
    put(r.route, 'initialClientJsRawKb', { ...base, value: a.initialClientJs?.rawKb ?? null, unit: 'kb' })
    put(r.route, 'initialCssKb', { ...base, value: a.css?.gzipKb ?? null, unit: 'kb' })
    put(r.route, 'sharedChunks', { ...base, value: a.sharedChunks ?? null, unit: 'count' })
    put(r.route, 'largestInitialKb', { ...base, value: a.largestInitialKb ?? null, unit: 'kb' })
    put(r.route, 'initialFiles', { ...base, value: a.initialClientJs?.files ?? null, unit: 'count' })
  }
}

function readBrowserAudit(rep, put) {
  for (const p of rep.data?.pages ?? []) {
    let route
    try { route = new URL(p.url).pathname } catch { route = p.url }
    const v = p.checks?.vitals
    if (v?.aggregate) {
      const profile = profileLabel(v.profile)
      for (const key of ['lcp', 'cls', 'fcp', 'ttfb']) {
        const m = v.aggregate[key]
        if (!m) continue
        put(route, key, { value: m.available ? m.p75 : null, unit: m.unit ?? (key === 'cls' ? 'score' : 'ms'), samples: m.validSamples ?? 0, min: m.min ?? null, max: m.max ?? null, available: Boolean(m.available), cause: m.available ? null : (m.unavailableCause ?? 'metric not emitted'), profile, evidence: 'browser-audit vitals (lab p75)', confidence: 'browser-evidence', kind: 'browser-evidence' })
      }
      const lt = v.aggregate.longTasks
      if (lt) put(route, 'longTasks', { value: lt.available ? lt.countMedian : null, unit: 'count', samples: lt.validSamples ?? 0, available: Boolean(lt.available), cause: lt.available ? null : 'no long task entry', profile, evidence: 'browser-audit vitals longTasks (diagnostic)', confidence: 'browser-evidence', kind: 'diagnostic' })
    }
    const ix = p.checks?.interactions
    if (ix?.steps) {
      const profile = profileLabel(ix.profile)
      for (const s of ix.steps) {
        put(route, `interaction:${s.label}`, { value: s.available && s.latency ? s.latency.p75 : null, unit: 'ms', samples: s.samples ?? 0, available: Boolean(s.available && s.latency), cause: s.available ? null : 'no Event Timing entry for this step (under threshold or no handler)', profile, evidence: 'browser-audit interactions (lab latency p75, Event Timing; NOT field INP)', confidence: 'browser-evidence', kind: 'browser-evidence' })
      }
    }
    const hc = p.checks?.hydrationCost
    if (hc) {
      const profile = profileLabel(hc.profile)
      const bp = hc.bootProxies ?? {}
      for (const key of ['ttfb', 'ssrBodyDownload', 'htmlParse', 'deferredScripts', 'dclHandlers', 'toLoad']) {
        put(route, `hydration:${key}`, { value: bp[key] ?? null, unit: 'ms', samples: hc.completedRuns ?? 0, available: bp[key] != null, cause: bp[key] == null ? 'proxy not recorded' : null, profile, evidence: 'browser-audit hydration-cost boot proxy (NOT an exact hydration time)', confidence: 'browser-evidence', kind: 'diagnostic' })
      }
      put(route, 'hydration:jsTransferBytes', { value: hc.jsCost?.transferBytesMedian ?? null, unit: 'bytes', samples: hc.completedRuns ?? 0, available: hc.jsCost?.transferBytesMedian != null, cause: null, profile, evidence: 'browser-audit hydration-cost JS transfer (network proxy)', confidence: 'browser-evidence', kind: 'network' })
      put(route, 'hydration:bootLongTaskTotalMs', { value: hc.bootWork?.longTaskTotalMsMedian ?? null, unit: 'ms', samples: hc.completedRuns ?? 0, available: hc.bootWork?.available ?? false, cause: hc.bootWork?.available ? null : 'no boot long task data', profile, evidence: 'browser-audit hydration-cost boot long tasks (diagnostic)', confidence: 'browser-evidence', kind: 'diagnostic' })
    }
  }
}

function readBundleBudget(rep, put) {
  const m = rep.data?.metrics ?? {}
  const base = { available: true, cause: null, samples: null, profile: 'build', evidence: `bundle-budget ${rep.summary?.output ?? ''}`.trim(), confidence: 'build-evidence', kind: 'build-evidence' }
  // build metrics are app-wide, keyed under '*'
  put('*', 'entryJsKb', { ...base, value: m.entryJsKb ?? null, unit: 'kb', available: m.entryJsKb != null, cause: m.entryJsKb == null ? 'entry assets not identifiable from this build (hash-only names, no manifest)' : null })
  put('*', 'entryCssKb', { ...base, value: m.entryCssKb ?? null, unit: 'kb', available: m.entryCssKb != null, cause: m.entryCssKb == null ? 'entry CSS not identifiable' : null })
  put('*', 'maxChunkKb', { ...base, value: m.maxChunkKb ?? null, unit: 'kb' })
  put('*', 'totalJsKb', { ...base, value: m.totalJsKb ?? null, unit: 'kb' })
}

// a stable, comparable label for a measurement profile (the browser-audit profile block, or 'build' for static)
function profileLabel(profile) {
  if (!profile || typeof profile !== 'object') return profile ?? 'unknown'
  const throttle = profile.cpuThrottle && profile.cpuThrottle !== 'none' ? `cpu:${profile.cpuThrottle}` : 'cpu:none'
  const net = /no throttling|no throttle/.test(String(profile.network ?? '')) ? 'net:none' : `net:${profile.network ?? 'unknown'}`
  const cache = profile.cachePerRun ?? 'cache:unknown'
  const vp = profile.viewport ? `${profile.viewport.width ?? profile.viewport}x${profile.viewport.height ?? ''}`.replace(/x$/, '') : 'vp:unknown'
  return `${vp}|${throttle}|${net}|${cache}`
}

// ---- budget validation --------------------------------------------------------------------------------------
const CATEGORIES = new Set(['build', 'route', 'network', 'experience', 'diagnostic'])
const UNITS = new Set(['kb', 'ms', 'score', 'count', 'bytes'])
function validateEntry(e, i) {
  const errs = []
  if (typeof e !== 'object' || e == null) return [`entry ${i}: not an object`]
  if (typeof e.metric !== 'string' || !e.metric) errs.push(`entry ${i}: missing "metric"`)
  if (e.threshold != null && typeof e.threshold !== 'number') errs.push(`entry ${i} (${e.metric}): "threshold" must be a number`)
  if (e.threshold == null) errs.push(`entry ${i} (${e.metric}): missing "threshold"`)
  if (e.category && !CATEGORIES.has(e.category)) errs.push(`entry ${i} (${e.metric}): unknown category "${e.category}"`)
  if (e.unit && !UNITS.has(e.unit)) errs.push(`entry ${i} (${e.metric}): unknown unit "${e.unit}"`)
  if (e.onMissing && !['unavailable', 'insufficient', 'fail'].includes(e.onMissing)) errs.push(`entry ${i} (${e.metric}): onMissing must be unavailable|insufficient|fail`)
  return errs
}

// ---- the evaluator ------------------------------------------------------------------------------------------
function evaluateEntry(entry, idx) {
  const route = entry.route ?? '*'
  const key = `${route}\u0000${entry.metric}`
  const onMissing = entry.onMissing ?? 'unavailable'
  const m = idx.get(key)
  const common = { route, metric: entry.metric, unit: entry.unit ?? null, threshold: entry.threshold, category: entry.category ?? null }
  if (!m) {
    const state = onMissing === 'fail' ? 'FAIL' : onMissing === 'insufficient' ? 'INSUFFICIENT_DATA' : 'UNAVAILABLE'
    return { ...common, state, value: null, samples: null, profile: null, evidence: null, reason: `no result provides ${entry.metric} for ${route} (did the producing check run?)` }
  }
  // unit mismatch between the budget and the metric is a configuration error, never a silent compare
  if (entry.unit && m.unit && entry.unit !== m.unit) return { ...common, state: 'INVALID_CONFIGURATION', value: m.value, samples: m.samples, profile: m.profile, evidence: m.evidence, reason: `unit mismatch: budget "${entry.unit}" vs measured "${m.unit}" — different magnitudes are not compared` }
  // profile mismatch: when the budget names a profile, it must match the measurement's profile
  if (entry.profile && m.profile && m.profile !== 'build' && entry.profile !== m.profile) return { ...common, state: 'INVALID_CONFIGURATION', value: m.value, samples: m.samples, profile: m.profile, evidence: m.evidence, reason: `profile mismatch: budget expects "${entry.profile}", measured under "${m.profile}"` }
  if (!m.available || m.value == null) {
    const state = onMissing === 'fail' ? 'FAIL' : 'UNAVAILABLE'
    return { ...common, state, value: null, samples: m.samples, profile: m.profile, evidence: m.evidence, reason: m.cause ?? 'metric unavailable' }
  }
  // lab metrics need enough valid runs; a build fact has samples null and is exempt from minSamples
  if (entry.minSamples != null && m.samples != null && m.samples < entry.minSamples) {
    return { ...common, state: 'INSUFFICIENT_DATA', value: m.value, samples: m.samples, profile: m.profile, evidence: m.evidence, reason: `only ${m.samples} valid sample(s), minSamples ${entry.minSamples}` }
  }
  const pass = m.value <= entry.threshold
  return { ...common, state: pass ? 'PASS' : 'FAIL', value: m.value, samples: m.samples, profile: m.profile, evidence: m.evidence, kind: m.kind, reason: pass ? null : `${m.value}${unitSuffix(m.unit)} exceeds budget ${entry.threshold}${unitSuffix(m.unit)}` }
}

const unitSuffix = (u) => (u === 'ms' ? 'ms' : u === 'kb' ? 'KB' : u === 'bytes' ? 'B' : '')

// ---- before/after comparison --------------------------------------------------------------------------------
// Compatibility first: a verdict is only given when the two measurements are of the same route, metric, unit and
// profile, and each has enough valid samples. Otherwise the pair is INVALID_CONFIGURATION or INSUFFICIENT_DATA.
function compareMetric(route, metric, before, after, minSamples) {
  const common = { route, metric }
  if (!before || !after) return { ...common, state: before || after ? 'INSUFFICIENT_DATA' : 'UNAVAILABLE', reason: !before && !after ? 'metric absent in both sets' : `metric present in only one set (${before ? 'before' : 'after'})` }
  if (before.unit !== after.unit) return { ...common, state: 'INVALID_CONFIGURATION', reason: `unit differs (${before.unit} vs ${after.unit}) — not comparable` }
  if (before.profile !== after.profile) return { ...common, state: 'INVALID_CONFIGURATION', reason: `measurement profile differs (${before.profile} vs ${after.profile}) — not comparable; measure both under the same profile` }
  if (!before.available || !after.available || before.value == null || after.value == null) return { ...common, state: 'UNAVAILABLE', reason: `metric unavailable in ${!before.available ? 'before' : 'after'} (${(!before.available ? before.cause : after.cause) ?? 'no value'})` }
  if (minSamples != null && ((before.samples ?? Infinity) < minSamples || (after.samples ?? Infinity) < minSamples)) return { ...common, state: 'INSUFFICIENT_DATA', reason: `fewer than ${minSamples} valid samples (before ${before.samples}, after ${after.samples})` }
  const abs = round(after.value - before.value, 3)
  const percent = pct(before.value, after.value)
  // Lower is better for every magnitude this tool compares (KB, ms, score, count, bytes). The verdict is driven by the
  // data, not only by the point estimate:
  //  - when both sets carry a per-run range [min,max] (lab metrics do), overlapping ranges mean the change is not
  //    distinguishable from run-to-run variance at these sample sizes -> inconclusive, with the ranges named. This is
  //    the honest guard against reading two p75 points as an effect when their spreads overlap.
  //  - otherwise (a build fact has no spread; interactions expose no min) fall back to a +/-2% floor: a smaller delta
  //    than that, at these samples, is not worth claiming either way.
  // In neither case does it assert the change *caused* the difference; a smaller number is evidence to keep reproducing.
  const haveRange = before.min != null && before.max != null && after.min != null && after.max != null
  const rangesOverlap = haveRange && before.min <= after.max && after.min <= before.max
  const tiny = before.value !== 0 && Math.abs(percent ?? 0) < 2
  let verdict, note
  if (rangesOverlap) {
    verdict = 'inconclusive'
    note = `the per-run ranges overlap (before ${before.min}..${before.max}, after ${after.min}..${after.max}); the change is within run-to-run variance at ${before.samples}/${after.samples} samples — not a demonstrated effect`
  } else if (tiny) {
    verdict = 'inconclusive'
    note = `within the +/-2% noise floor at ${before.samples ?? 'n/a'}/${after.samples ?? 'n/a'} samples${haveRange ? `; the per-run ranges separate (before ${before.min}..${before.max}, after ${after.min}..${after.max}) but the point moved less than the floor` : ' (no per-run range to test overlap)'}`
  } else {
    verdict = after.value < before.value ? 'improved' : after.value > before.value ? 'regressed' : 'inconclusive'
    note = `lower is better; delta is after-before (negative = improvement)${haveRange ? `; ranges separate (before ${before.min}..${before.max}, after ${after.min}..${after.max})` : '; no per-run range available, point estimates only'}`
  }
  return { ...common, state: 'COMPARED', unit: before.unit, before: before.value, after: after.value, absolute: abs, percent, samples: { before: before.samples, after: after.samples }, range: haveRange ? { before: [before.min, before.max], after: [after.min, after.max] } : null, profile: before.profile, verdict, note }
}

// ---- running ------------------------------------------------------------------------------------------------
function loadJson(file) {
  const p = resolve(String(file))
  if (!existsSync(p)) throw new Error(`file not found: ${file}`)
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch (e) { throw new Error(`${basename(p)}: not valid JSON (${e.message})`) }
}

export function run(argv) {
  const args = parseArgs(argv)
  if (args.help) return usage(HELP)

  // a minimal project stub so createReport works without a project root (this tool reads result files, not a repo)
  const project = { root: process.cwd(), framework: 'budget', config: null, notes: [] }
  const report = createReport('perf-budget', project)

  // ----- compare mode -----
  if (args.compare != null) {
    const files = [args.compare, ...(args._ ?? [])].filter(Boolean)
    if (files.length < 2) return fail('compare needs two result files: --compare <before.json> <after.json>')
    let beforeRep, afterRep
    try { beforeRep = loadJson(files[0]); afterRep = loadJson(files[1]) } catch (e) { return fail(e.message) }
    const beforeIdx = indexResults(Array.isArray(beforeRep) ? beforeRep : [beforeRep])
    const afterIdx = indexResults(Array.isArray(afterRep) ? afterRep : [afterRep])
    let budget = null
    if (args.budget) { try { budget = loadJson(args.budget) } catch (e) { return fail(e.message) } }
    const minSamplesByMetric = new Map((Array.isArray(budget) ? budget : []).map((e) => [`${e.route ?? '*'}\u0000${e.metric}`, e.minSamples]))
    // compare every metric present in either set (or, if a budget is given, the metrics it names)
    const keys = budget && Array.isArray(budget) ? budget.map((e) => `${e.route ?? '*'}\u0000${e.metric}`) : [...new Set([...beforeIdx.keys(), ...afterIdx.keys()])]
    const comparisons = []
    for (const key of keys) {
      const [route, metric] = key.split('\u0000')
      comparisons.push(compareMetric(route, metric, beforeIdx.get(key), afterIdx.get(key), minSamplesByMetric.get(key)))
    }
    const verdicts = comparisons.filter((c) => c.state === 'COMPARED')
    const improved = verdicts.filter((c) => c.verdict === 'improved')
    const regressed = verdicts.filter((c) => c.verdict === 'regressed')
    report.summary = { mode: 'compare', before: basename(resolve(String(files[0]))), after: basename(resolve(String(files[1]))), metricsCompared: verdicts.length, improved: improved.length, regressed: regressed.length, inconclusive: verdicts.filter((c) => c.verdict === 'inconclusive').length, notComparable: comparisons.length - verdicts.length }
    report.data = { comparisons }
    for (const c of regressed) addFinding(report, { id: 'perf-regression', level: 'confirmed', severity: 'high', file: c.route, message: `${c.metric}: ${c.before}${unitSuffix(c.unit)} -> ${c.after}${unitSuffix(c.unit)} (${c.percent > 0 ? '+' : ''}${c.percent}%) regressed, same profile ${c.profile}`, fix: 'a measured regression between two compatible result sets; confirm it reproduces and is not sample noise before shipping' })
    for (const c of improved) addFinding(report, { id: 'perf-improvement', level: 'info', severity: 'info', file: c.route, message: `${c.metric}: ${c.before}${unitSuffix(c.unit)} -> ${c.after}${unitSuffix(c.unit)} (${c.percent}%) improved, same profile ${c.profile}`, fix: 'an observed improvement between compatible sets; a smaller number is evidence, not proof the change caused it — keep the comparison reproducible' })
    for (const c of comparisons.filter((x) => x.state === 'INVALID_CONFIGURATION')) addFinding(report, { id: 'perf-compare-not-comparable', level: 'info', severity: 'info', file: c.route, message: `${c.metric}: not compared — ${c.reason}`, fix: 'make the two measurements compatible (same route, metric, unit and profile) before comparing' })
    const sections = [{ title: 'Before / after', table: { headers: ['route', 'metric', 'state', 'before', 'after', 'Δ', 'Δ%', 'verdict', 'profile'], rows: comparisons.map((c) => [c.route, c.metric, c.state, c.before ?? '-', c.after ?? '-', c.absolute ?? '-', c.percent ?? '-', c.verdict ?? '-', c.profile ?? '-']) } }]
    report.notes.push('a verdict is only given for a compatible, sufficiently-sampled pair; different profiles/units/routes are reported INVALID_CONFIGURATION and never read as an improvement. Lab latency is not field INP.')
    report.analysis = `mode: compare; metrics compared: ${verdicts.length}; not comparable: ${comparisons.length - verdicts.length}`
    return finish(report, args, { sections })
  }

  // ----- evaluate mode -----
  if (!args.budget) return usage(HELP)
  let budget
  try { budget = loadJson(args.budget) } catch (e) { return fail(e.message) }
  if (!Array.isArray(budget)) return fail('budget file must be a JSON array of budget entries')
  const configErrors = budget.flatMap((e, i) => validateEntry(e, i))
  const resultFiles = args.results ? String(args.results).split(',').map((s) => s.trim()).filter(Boolean) : []
  if (!resultFiles.length) return fail('evaluate needs --results <a.json,b.json,...> (the reports to judge)')
  let reports
  try { reports = resultFiles.flatMap((f) => { const j = loadJson(f); return Array.isArray(j) ? j : [j] }) } catch (e) { return fail(e.message) }
  const idx = indexResults(reports)

  const evaluations = budget.map((entry, i) => {
    const entryErrs = validateEntry(entry, i)
    if (entryErrs.length) return { route: entry?.route ?? '*', metric: entry?.metric ?? `entry ${i}`, state: 'INVALID_CONFIGURATION', reason: entryErrs.join('; ') }
    return { ...evaluateEntry(entry, idx), failOn: entry.failOn !== false, severity: entry.severity ?? 'medium' }
  })

  const by = (s) => evaluations.filter((e) => e.state === s)
  report.summary = { mode: 'evaluate', entries: evaluations.length, pass: by('PASS').length, fail: by('FAIL').length, unavailable: by('UNAVAILABLE').length, insufficientData: by('INSUFFICIENT_DATA').length, invalidConfiguration: by('INVALID_CONFIGURATION').length, resultsRead: resultFiles.map((f) => basename(resolve(f))) }
  report.data = { evaluations }

  for (const e of evaluations) {
    if (e.state === 'FAIL') addFinding(report, { id: 'budget-fail', level: e.failOn ? 'confirmed' : 'heuristic', severity: e.severity, file: e.route, message: `${e.metric} ${e.reason} (${e.profile ?? 'build'}${e.samples != null ? `, ${e.samples} samples` : ''})`, fix: `over the opt-in budget; evidence: ${e.evidence ?? 'n/a'}. A build/lab breach is a signal to profile and re-measure, not a field verdict` })
    else if (e.state === 'INVALID_CONFIGURATION') addFinding(report, { id: 'budget-invalid', level: 'info', severity: 'info', file: e.route, message: `${e.metric}: invalid budget — ${e.reason}`, fix: 'fix the budget entry (metric name, unit, profile, threshold)' })
    else if (e.state === 'UNAVAILABLE') addFinding(report, { id: 'budget-unavailable', level: 'info', severity: 'info', file: e.route, message: `${e.metric}: UNAVAILABLE — ${e.reason}`, fix: 'the producing check did not emit this metric; run it (and for lab metrics, enough runs) — absence is not a pass' })
    else if (e.state === 'INSUFFICIENT_DATA') addFinding(report, { id: 'budget-insufficient', level: 'info', severity: 'info', file: e.route, message: `${e.metric}: INSUFFICIENT_DATA — ${e.reason}`, fix: 'add runs so the lab metric has enough valid samples; a few runs are a distribution, not a determinism promise' })
  }
  const sections = [{ title: 'Budgets', table: { headers: ['route', 'metric', 'state', 'value', 'threshold', 'samples', 'profile', 'evidence'], rows: evaluations.map((e) => [e.route, e.metric, e.state, e.value ?? '-', e.threshold ?? '-', e.samples ?? '-', e.profile ?? '-', e.evidence ?? e.reason ?? '-']) } }]
  if (configErrors.length) report.notes.push(`${configErrors.length} budget entry(ies) are invalid and were reported INVALID_CONFIGURATION, not skipped.`)
  report.notes.push('absence of a measurement is UNAVAILABLE or INSUFFICIENT_DATA, never PASS and never zero; a build byte is not a transferred byte is not a millisecond is not a CLS score.')
  report.analysis = `mode: evaluate; entries: ${evaluations.length}; results read: ${resultFiles.length}`
  return finish(report, args, { sections })
}

if (isMainModule(import.meta.url)) process.exitCode = run(process.argv.slice(2))
