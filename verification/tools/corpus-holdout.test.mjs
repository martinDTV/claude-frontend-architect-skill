// hold-out integrity (1.7 increment 3C): guards that keep the development and hold-out corpora honest and separate.
// Deterministic, no model, no agent. These assert structure and separation — NOT tool scores (those live in
// corpus-regression.test.mjs for dev; the hold-out numbers are reported in docs, not pinned, because a hold-out is a
// moving generalization check, not a frozen baseline).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const dev = join(root, 'verification', 'corpus')
const holdout = join(root, 'verification', 'corpus-holdout')
const measure = join(dev, 'measure.mjs')
const AREAS = ['arch', 'state', 'routes', 'perf', 'a11y', 'bundle', 'ds']
const run = (args) => JSON.parse(execFileSync(process.execPath, [measure, '--json', ...args], { encoding: 'utf8', maxBuffer: 48 * 1024 * 1024 }))

const holdoutCases = () => AREAS.flatMap((a) => { const d = join(holdout, a); return existsSync(d) ? readdirSync(d).filter((c) => statSync(join(d, c)).isDirectory()).map((c) => ({ area: a, name: c, gt: JSON.parse(readFileSync(join(d, c, 'ground-truth.json'), 'utf8')) })) : [] })
const devCases = () => AREAS.flatMap((a) => { const d = join(dev, a); return existsSync(d) ? readdirSync(d).filter((c) => statSync(join(d, c)).isDirectory()).map((c) => ({ area: a, name: c, gt: JSON.parse(readFileSync(join(d, c, 'ground-truth.json'), 'utf8')) })) : [] })

test('development and hold-out live in separate trees and are measured separately', () => {
  assert.ok(existsSync(dev) && existsSync(holdout), 'both corpora exist')
  // a --root run of the hold-out must not include any development case name, and vice versa
  const devNames = new Set(devCases().map((c) => `${c.area}/${c.name}`))
  const hoNames = new Set(holdoutCases().map((c) => `${c.area}/${c.name}`))
  for (const n of hoNames) assert.ok(!devNames.has(n), `hold-out case ${n} must not exist in development`)
})

test('hold-out case names encode their set (A=known-limit, B=generalization), nothing else', () => {
  for (const c of holdoutCases()) {
    assert.match(c.name, /^(A|B)\d/, `${c.area}/${c.name}: hold-out case must be named A.. (known-limit) or B.. (generalization)`)
  }
})

test('every blind generalization (B) case declares its blind provenance', () => {
  for (const c of holdoutCases()) {
    if (!c.name.startsWith('B')) continue
    assert.match(String(c.gt.provenance || ''), /blind generalization/i, `${c.area}/${c.name}: a B case must carry blind-generalization provenance`)
  }
})

test('insufficient-* cases carry an explicit scenario_polarity (miss|trap)', () => {
  for (const c of [...devCases(), ...holdoutCases()]) {
    if (!/insufficient/.test(c.gt.category || '')) continue
    assert.ok(['miss', 'trap'].includes(c.gt.scenario_polarity), `${c.area}/${c.name}: insufficient-* needs scenario_polarity miss|trap, got ${c.gt.scenario_polarity}`)
    // polarity must match the truth: a "miss" has a real defect the tool should (expected[]) or structurally cannot
    // (coverage_gaps[]) catch; a "trap" has neither — it is correct code the tool must not over-flag.
    const hasDefect = (c.gt.expected || []).length > 0 || (c.gt.coverage_gaps || []).length > 0
    assert.equal(hasDefect, c.gt.scenario_polarity === 'miss', `${c.area}/${c.name}: a "miss" must carry a defect in expected[] or coverage_gaps[]; a "trap" must carry neither`)
  }
})

test('coverage_gaps are counted in cov-gap and excluded from recall', () => {
  const r = run(['--area', 'a11y'])
  const area = r.perArea.a11y
  assert.ok(area.coverageGap >= 1, 'the a11y custom-widget coverage gap is counted')
  // recall uses only tp/fn; a coverage gap must not have been added to fn
  const impliedRecall = area.tp + area.fn ? area.tp / (area.tp + area.fn) : null
  assert.equal(impliedRecall, area.recall, 'coverage gaps do not enter recall')
})

test('clean-held (TN) never enters precision or recall', () => {
  // a synthetic area-level check via the public prf is covered in corpus-measure.test; here confirm the live numbers:
  const r = run([])
  for (const [a, x] of Object.entries(r.perArea)) {
    if (x.tp + x.fp > 0) assert.equal(x.precision, x.tp / (x.tp + x.fp), `${a}: precision ignores clean-held`)
    if (x.tp + x.fn > 0) assert.equal(x.recall, x.tp / (x.tp + x.fn), `${a}: recall ignores clean-held`)
  }
})

test('measurement is reproducible for dev and for each hold-out set', () => {
  assert.deepEqual(run([]).overall, run([]).overall)
  assert.deepEqual(run(['--root', 'verification/corpus-holdout', '--set', 'B']).overall, run(['--root', 'verification/corpus-holdout', '--set', 'B']).overall)
})

test('no ground-truth.json embeds auditor output (no raw findings arrays copied in)', () => {
  // an independent truth describes expected/forbidden by hand; it must not carry a tool "findings" dump or "generatedAt".
  for (const c of [...devCases(), ...holdoutCases()]) {
    assert.ok(!('findings' in c.gt), `${c.area}/${c.name}: ground truth must not contain a tool findings array`)
    assert.ok(!('generatedAt' in c.gt), `${c.area}/${c.name}: ground truth must not contain tool output fields`)
  }
})
