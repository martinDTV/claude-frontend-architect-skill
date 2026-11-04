// corpus regression (1.7 increment 3): runs the adversarial FP/FN corpus against the real auditors and pins the measured
// outcome, so a future change that silently worsens precision/recall (more FP or more FN) is caught, and the known
// deficiencies stay documented rather than regressing unnoticed. It runs the tools (no agent, no model), ~4s. The exact
// per-area expectations are the honest numbers measured in increment 3 — not aspirational; if a tool is IMPROVED to fix a
// known FN/FP, this test will fail and should be updated downward in the same change that improves the tool.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const measure = join(here, '..', 'corpus', 'measure.mjs')
const run = () => JSON.parse(execFileSync(process.execPath, [measure, '--json'], { encoding: 'utf8', maxBuffer: 48 * 1024 * 1024 }))

// The measured baseline of increment 3 (46 cases across 6 areas). FP/FN are the known limits (documented in
// docs/corpus-fp-fn-results.md); the assertions are directional guards, not a demand for perfection.
const EXPECT = {
  arch:   { cases: 8, fp: 0, fn: 0 },
  state:  { cases: 8, fp: 0, fn: 1 },   // known FN: no variable resolution
  routes: { cases: 8, fp: 2, fn: 0 },   // known FP: auth/validation in an imported helper
  perf:   { cases: 8, fp: 0, fn: 2 },   // known FN: re-export/side-effect imports; effect one call deep
  a11y:   { cases: 8, fp: 0, fn: 0 },
  bundle: { cases: 6, fp: 0, fn: 0 },
}

test('the corpus runs and every area is populated', () => {
  const r = run()
  for (const [area, e] of Object.entries(EXPECT)) {
    assert.ok(r.perArea[area], `area ${area} missing`)
    assert.equal(r.perArea[area].cases, e.cases, `${area} case count`)
  }
})

test('false positives do not exceed the known baseline (no silent precision regression)', () => {
  const r = run()
  for (const [area, e] of Object.entries(EXPECT)) {
    assert.ok(r.perArea[area].fp <= e.fp, `${area}: FP ${r.perArea[area].fp} > known ${e.fp} — a new false positive regressed precision (or fix the tool and lower this)`)
  }
})

test('false negatives do not exceed the known baseline (no silent recall regression)', () => {
  const r = run()
  for (const [area, e] of Object.entries(EXPECT)) {
    assert.ok(r.perArea[area].fn <= e.fn, `${area}: FN ${r.perArea[area].fn} > known ${e.fn} — a new missed defect regressed recall (or fix the tool and lower this)`)
  }
})

test('the overall numbers are reproducible across two runs', () => {
  const a = run(), b = run()
  assert.deepEqual(a.overall, b.overall, 'measurement must be deterministic')
})

test('no area fabricates a perfect score with zero data (precision/recall null, not fake 100%)', () => {
  const r = run()
  for (const area of Object.keys(EXPECT)) {
    const x = r.perArea[area]
    if (x.tp + x.fp + x.fn === 0) assert.fail(`${area} has no positives/negatives to score — it must carry real cases`)
  }
})
