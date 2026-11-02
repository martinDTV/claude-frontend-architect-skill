// perf-budget (1.6 increment 5): performance budgets and verified optimization, a pure evaluator over the JSON the
// existing tools emit. The fixtures carry an acceptance criterion written before the rules (fixtures/perf-budget/
// expected.md); the tests assert states and verdicts and the sign of a change, never exact machine timings. The suite
// proves that a deliberately regressive change produces a FAIL/regressed, that a non-verifiable case never yields a
// false PASS, that absence of data is UNAVAILABLE/INSUFFICIENT_DATA (never zero), and that different profiles or units
// are never compared as if equivalent.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { fixtures, runTool } from './helpers.mjs'

const D = join(fixtures, 'perf-budget')
const f = (name) => join(D, name)
const evalBudget = (budget, results) => runTool('perf-budget.mjs', ['--budget', f(budget), '--results', results.map(f).join(',')])
const compare = (before, after, budget) => runTool('perf-budget.mjs', ['--compare', f(before), f(after), ...(budget ? ['--budget', f(budget)] : [])])
const cmp = (report, route, metric) => report.data.comparisons.find((c) => c.route === route && c.metric === metric)
const ev = (report, route, metric) => report.data.evaluations.find((e) => e.route === route && e.metric === metric)

// ----- evaluate mode -----
test('F: one route breaches its budget (FAIL, confirmed) and another passes', () => {
  const { code, report } = evalBudget('F-budget.json', ['F-results.json'])
  assert.equal(ev(report, '/heavy', 'initialClientJsKb').state, 'FAIL')
  assert.equal(ev(report, '/light', 'initialClientJsKb').state, 'PASS')
  assert.ok(report.findings.some((x) => x.id === 'budget-fail' && x.level === 'confirmed' && x.file === '/heavy'))
  assert.equal(code, 1, 'a failOn budget FAIL makes the exit non-zero (default --fail-on confirmed)')
})

test('G: a metric the build cannot provide is UNAVAILABLE, never a false PASS or zero', () => {
  const { code, report } = evalBudget('G-budget.json', ['G-unavailable.json'])
  const e = ev(report, '/blog/[slug]', 'initialClientJsKb')
  assert.equal(e.state, 'UNAVAILABLE')
  assert.equal(e.value, null, 'no value is invented')
  assert.ok(e.reason && e.reason.length > 5, 'the reason is given')
  assert.ok(!report.findings.some((x) => x.level === 'confirmed'), 'absence is not a confirmed pass or fail')
  assert.equal(code, 0, 'an unavailable metric does not fail the build')
})

test('I: a unit mismatch between budget and metric is INVALID_CONFIGURATION, not a silent compare', () => {
  const { report } = evalBudget('I-budget.json', ['J-desktop.json'])
  const e = ev(report, '/app', 'lcp')
  assert.equal(e.state, 'INVALID_CONFIGURATION')
  assert.match(e.reason, /unit mismatch/)
})

test('an invalid budget entry (missing threshold) is INVALID_CONFIGURATION, reported not skipped', () => {
  const { report } = evalBudget('invalid-budget.json', ['J-desktop.json'])
  const e = ev(report, '/app', 'lcp')
  assert.equal(e.state, 'INVALID_CONFIGURATION')
  assert.match(e.reason, /missing "threshold"/)
})

test('H: fewer valid runs than minSamples is INSUFFICIENT_DATA in evaluate mode', () => {
  const { report } = evalBudget('H-budget.json', ['H-1run.json'])
  assert.equal(ev(report, '/app', 'lcp').state, 'INSUFFICIENT_DATA')
})

test('H: enough runs passes the same budget', () => {
  const { report } = evalBudget('H-budget.json', ['H-5run.json'])
  assert.equal(ev(report, '/app', 'lcp').state, 'PASS')
})

// ----- compare mode -----
test('A: a heavy initial import moved to deferred is an observed improvement; unchanged metrics are inconclusive', () => {
  const { report } = compare('A-before.json', 'A-after.json')
  const js = cmp(report, '/lab/atelier', 'initialClientJsKb')
  assert.equal(js.state, 'COMPARED')
  assert.equal(js.verdict, 'improved')
  assert.ok(js.after < js.before && js.percent < -50, 'a large negative change')
  assert.equal(cmp(report, '/lab/atelier', 'initialCssKb').verdict, 'inconclusive', 'unchanged CSS is not a spurious win')
  assert.equal(cmp(report, '/lab/atelier', 'sharedChunks').verdict, 'inconclusive')
  assert.ok(report.findings.some((x) => x.id === 'perf-improvement'))
})

test('B: introducing CLS is a regression; correcting it is an improvement', () => {
  const bad = compare('B-cls-good.json', 'B-cls-bad.json')
  assert.equal(cmp(bad.report, '/landing', 'cls').verdict, 'regressed')
  assert.equal(bad.code, 1, 'a regression fails the exit when --fail-on confirmed (default)')
  const good = compare('B-cls-bad.json', 'B-cls-good.json')
  assert.equal(cmp(good.report, '/landing', 'cls').verdict, 'improved')
})

test('C: a slow handler optimized is an improvement; the reverse is a regression (lab latency, not field INP)', () => {
  const faster = compare('C-slow.json', 'C-fast.json')
  const c = cmp(faster.report, '/app', 'interaction:open menu')
  assert.equal(c.verdict, 'improved')
  const slower = compare('C-fast.json', 'C-slow.json')
  assert.equal(cmp(slower.report, '/app', 'interaction:open menu').verdict, 'regressed')
})

test('D: heavy hydration made light improves the boot proxies', () => {
  const { report } = compare('D-heavy.json', 'D-light.json')
  assert.equal(cmp(report, '/app', 'hydration:toLoad').verdict, 'improved')
  assert.equal(cmp(report, '/app', 'hydration:jsTransferBytes').verdict, 'improved')
})

test('E: a shared resource counted once produces no spurious delta between identical builds', () => {
  const { report } = compare('E-before.json', 'E-after.json')
  for (const m of ['initialClientJsKb', 'sharedChunks']) assert.equal(cmp(report, '/app/a', m).verdict, 'inconclusive')
})

test('H: insufficient samples block the comparison verdict', () => {
  const { report } = compare('H-5run.json', 'H-1run.json', 'H-budget.json')
  assert.equal(cmp(report, '/app', 'lcp').state, 'INSUFFICIENT_DATA')
})

test('J: different measurement profiles are INVALID_CONFIGURATION, never read as an improvement', () => {
  const { report } = compare('J-desktop.json', 'J-mobile.json')
  const c = cmp(report, '/app', 'lcp')
  assert.equal(c.state, 'INVALID_CONFIGURATION')
  assert.match(c.reason, /profile differs/)
  assert.ok(!report.findings.some((x) => x.id === 'perf-improvement'), 'a profile mismatch is never an improvement')
})

test('K: a change within the noise band (<2%) is inconclusive, not a claimed win', () => {
  const { report } = compare('K-before.json', 'K-after.json')
  assert.equal(cmp(report, '/app', 'lcp').verdict, 'inconclusive')
})

test('L: overlapping per-run ranges are inconclusive even when the p75 point moves (increment 6)', () => {
  const { report } = compare('L-before.json', 'L-overlap.json')
  const c = cmp(report, '/app', 'lcp')
  assert.equal(c.state, 'COMPARED')
  assert.equal(c.verdict, 'inconclusive', 'overlapping ranges mean the change is within variance, not a demonstrated effect')
  assert.match(c.note, /ranges overlap/)
  assert.ok(c.before > c.after, 'the p75 point did drop, but the verdict stays inconclusive because the spreads overlap')
})

test('L: separated per-run ranges are a real improvement (increment 6)', () => {
  const { report } = compare('L-before.json', 'L-separated.json')
  const c = cmp(report, '/app', 'lcp')
  assert.equal(c.verdict, 'improved')
  assert.match(c.note, /ranges separate/)
})

test('the honesty invariants are stated in the notes', () => {
  const { report } = evalBudget('F-budget.json', ['F-results.json'])
  assert.ok(report.notes.some((n) => /never PASS and never zero/.test(n)))
  const { report: cr } = compare('A-before.json', 'A-after.json')
  assert.ok(cr.notes.some((n) => /not field INP/.test(n) && /different profiles/.test(n)))
})

test('M: a sub-2% move with separated ranges is inconclusive, and the note does not deny the ranges it carries (increment 6 audit)', () => {
  const { report } = compare('L-before.json', 'M-tiny-separated.json')
  const c = cmp(report, '/app', 'lcp')
  assert.equal(c.verdict, 'inconclusive', 'a point move under the noise floor is not a claimed win even when the ranges separate')
  assert.ok(c.range, 'the record carries the per-run ranges')
  assert.doesNotMatch(c.note, /no per-run range/, 'the note must not claim there is no range when the record shows one')
  assert.match(c.note, /ranges separate/, 'the note states the ranges separate but the point stayed under the floor')
})

test('the report carries the full contract shape including analysis in both modes (increment 6 audit)', () => {
  const keys = ['tool', 'version', 'root', 'framework', 'summary', 'findings', 'notes', 'data', 'analysis']
  const { report: cmpReport } = compare('A-before.json', 'A-after.json')
  for (const k of keys) assert.ok(k in cmpReport, `compare report lacks ${k}`)
  const { report: evalReport } = evalBudget('F-budget.json', ['F-results.json'])
  for (const k of keys) assert.ok(k in evalReport, `evaluate report lacks ${k}`)
})
