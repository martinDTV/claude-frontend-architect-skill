// perf-audit (1.6 increment 1): static performance patterns, low-noise by design. Each fixture carries a
// truth written before the detectors ran; the tests assert no false negatives, no false positives, the
// evidence contract (confirmed is a certain syntactic fact, never a measured slowdown), the React Compiler
// downgrade, and that the reference applications raise no confirmed finding.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, here, runTool } from './helpers.mjs'

const key = (f) => `${f.file}:${f.line} ${f.id} ${f.level}`
const truthOf = (app) => JSON.parse(readFileSync(join(fixtures, app, 'expected-findings.json'), 'utf8')).findings

function checkFixture(app, { expectExit }) {
  const { code, report } = runTool('perf-audit.mjs', [join(fixtures, app)])
  const got = new Set(report.findings.map(key))
  const want = new Set(truthOf(app).map(key))
  assert.deepEqual([...want].filter((k) => !got.has(k)), [], `${app}: false negatives`)
  assert.deepEqual([...got].filter((k) => !want.has(k)), [], `${app}: false positives`)
  assert.equal(code, expectExit, `${app}: exit code`)
  return report
}

test('react fixture: every positive caught, no negative flagged; a random key is confirmed, the rest heuristic', () => {
  const report = checkFixture('perf-react-app', { expectExit: 1 }) // a confirmed finding -> exit 1
  // the only confirmed finding is the Math.random() key; everything else is a plausible risk
  const confirmed = report.findings.filter((f) => f.level === 'confirmed')
  assert.equal(confirmed.length, 1)
  assert.equal(confirmed[0].id, 'list-key-unstable')
  assert.match(confirmed[0].evidence, /Math\.random/)
  // the negatives file and the server-only module raise nothing
  assert.ok(!report.findings.some((f) => f.file.endsWith('negatives.tsx')), 'negatives.tsx is clean')
  assert.ok(!report.findings.some((f) => f.file.endsWith('server-data.ts')), 'a server-only heavy import is not flagged')
  // every finding names a measurement; confirmed never asserts a slowdown
  assert.ok(report.findings.every((f) => /measure|confirm|Profiler|bundle-budget|Performance panel/i.test(f.fix)), 'each fix names a measurement')
  assert.ok(report.notes.some((n) => /confirmed finding is a certain syntactic fact, not a measured/i.test(n)))
})

test('react compiler: the inline-provider value is downgraded to info, not a heuristic to fix by hand', () => {
  const report = checkFixture('perf-react-compiler-app', { expectExit: 0 }) // no confirmed -> exit 0
  const pv = byId(report, 'provider-inline-value')
  assert.equal(pv.length, 1)
  assert.equal(pv[0].level, 'info')
  assert.match(pv[0].fix, /React Compiler memoises this automatically/)
  assert.ok(report.notes.some((n) => /React Compiler detected/.test(n)))
})

test('vue fixture: heavy import, computed side effect and whole-reactive/props watch; the pure getter and specific watch are clean', () => {
  const report = checkFixture('perf-vue-app', { expectExit: 0 }) // all heuristic -> exit 0
  assert.equal(byId(report, 'reactive-deep-watch').length, 2)
  assert.equal(byId(report, 'computed-side-effect').length, 1)
  assert.ok(!report.findings.some((f) => f.file.endsWith('Negatives.vue')), 'the pure computed and the specific-getter watch raise nothing')
  assert.ok(report.findings.every((f) => f.level === 'heuristic'), 'no confirmed finding: a static pattern is not a measured regression')
})

test('the reference applications raise no confirmed performance finding', () => {
  for (const app of ['nuxt', 'next']) {
    const { report } = runTool('perf-audit.mjs', [join(here, '..', app), '--exclude', 'harness/**'])
    const confirmed = report.findings.filter((f) => f.level === 'confirmed')
    assert.deepEqual(confirmed.map((f) => `${f.file}:${f.id}`), [], `${app}: confirmed findings`)
  }
})

test('precision and recall on the controlled fixtures are 100%', () => {
  let tp = 0, fp = 0, fn = 0
  for (const app of ['perf-react-app', 'perf-react-compiler-app', 'perf-vue-app']) {
    const { report } = runTool('perf-audit.mjs', [join(fixtures, app)])
    const got = new Set(report.findings.map(key))
    const want = new Set(truthOf(app).map(key))
    for (const k of want) (got.has(k) ? tp++ : fn++)
    for (const k of got) if (!want.has(k)) fp++
  }
  const precision = tp / (tp + fp)
  const recall = tp / (tp + fn)
  assert.equal(fp, 0, 'false positives on the controlled fixtures')
  assert.equal(fn, 0, 'false negatives on the controlled fixtures')
  assert.equal(precision, 1)
  assert.equal(recall, 1)
})
