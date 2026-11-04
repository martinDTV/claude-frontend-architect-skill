// corpus-measure (1.7 increment 3, Fase 4): adversarial tests of the MEASURER itself. Before trusting any precision/recall
// number, the counting logic must be proven correct: a missed defect is an FN, an invented finding is an FP, a negative
// control with a defect finding is an FP (not a TN), a clean case with no finding is a TN, a heuristic where confirmed is
// due is a partial (not a silent TP), out-of-scope ids are excluded (never a TN or FN), and denominators are right. These
// feed synthetic (truth, findings) pairs straight into classifyCase — no tool, no model, fully deterministic.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyCase, prf } from '../corpus/measure.mjs'

const F = (id, file, line, level = 'confirmed') => ({ id, file, line, level })

test('a correctly detected defect is a TP', () => {
  const truth = { category: 'real-defect', expected: [{ id: 'token-in-web-storage', file: 'app/a.ts', line: 10, min_level: 'confirmed' }] }
  const r = classifyCase(truth, [F('token-in-web-storage', 'app/a.ts', 10)])
  assert.equal(r.tp, 1); assert.equal(r.fp, 0); assert.equal(r.fn, 0)
})

test('a missed defect is an FN, never a silent pass', () => {
  const truth = { category: 'real-defect', expected: [{ id: 'token-in-web-storage', file: 'app/a.ts', line: 10, min_level: 'confirmed' }] }
  const r = classifyCase(truth, []) // tool found nothing
  assert.equal(r.fn, 1); assert.equal(r.tp, 0)
})

test('an invented finding on a negative control is an FP, not a TN', () => {
  const truth = { category: 'negative-control', expected: [], forbidden: [] }
  const r = classifyCase(truth, [F('module-level-mutable-state', 'app/clean.ts', 3)])
  assert.equal(r.fp, 1); assert.equal(r.tn, 0)
})

test('a clean negative control with no defect finding is a TN', () => {
  const truth = { category: 'negative-control', expected: [] }
  const r = classifyCase(truth, []) // info-level non-defect findings would not count; none here
  assert.equal(r.tn, 1); assert.equal(r.fp, 0); assert.equal(r.fn, 0)
})

test('a forbidden id reported on correct-suspicious code is an FP', () => {
  const truth = { category: 'correct-suspicious', expected: [], forbidden: [{ id: 'module-level-mutable-state', file: 'app/frozen.ts', why_not_a_defect: 'frozen const' }] }
  const r = classifyCase(truth, [F('module-level-mutable-state', 'app/frozen.ts', 5)])
  assert.equal(r.fp, 1); assert.equal(r.tn, 0)
})

test('heuristic where confirmed is due is a partial TP, recorded separately', () => {
  const truth = { category: 'real-defect', expected: [{ id: 'x', file: 'app/a.ts', line: 10, min_level: 'confirmed' }] }
  const r = classifyCase(truth, [F('x', 'app/a.ts', 10, 'heuristic')])
  assert.equal(r.tp, 1, 'still detected')
  assert.equal(r.heuristicPartial, 1, 'but flagged as a weaker level than due')
})

test('an out-of-scope finding is neither TP/FP; an out-of-scope expected miss is not an FN', () => {
  const truth = { category: 'real-defect', expected: [{ id: 'in-scope', file: 'app/a.ts', line: 1, min_level: 'confirmed' }], out_of_scope: ['noise-id'] }
  const r = classifyCase(truth, [F('in-scope', 'app/a.ts', 1), F('noise-id', 'app/a.ts', 2)])
  assert.equal(r.tp, 1)
  assert.equal(r.fp, 0, 'the out-of-scope finding is excluded, not an FP')
})

test('a valid finding at the WRONG line does not count as a TP (it is an FN + an FP)', () => {
  const truth = { category: 'real-defect', line_tolerance: 1, expected: [{ id: 'x', file: 'app/a.ts', line: 10, min_level: 'confirmed' }] }
  const r = classifyCase(truth, [F('x', 'app/a.ts', 99)])
  assert.equal(r.tp, 0); assert.equal(r.fn, 1, 'the expected defect was not matched'); assert.equal(r.fp, 1, 'the off-line finding is unexpected')
})

test('prf: precision/recall/f1 denominators are correct, and null when undefined', () => {
  assert.deepEqual(prf(3, 1, 1), { precision: 0.75, recall: 0.75, f1: 0.75 })
  assert.deepEqual(prf(0, 0, 0), { precision: null, recall: null, f1: null }, 'no data -> null, never a fake 100%')
  const r = prf(0, 0, 2); assert.equal(r.precision, null); assert.equal(r.recall, 0)
})
