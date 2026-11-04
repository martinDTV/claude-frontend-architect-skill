// eval-inventory (1.7 increment 1): the inventory is deterministic, covers every case, and never asserts a behavioural
// PASS. These tests pin that contract: it classifies all 95 cases, marks the provider-gated ranges NOT_RUN, emits no
// PASS state, and produces identical output on a second run (determinism). No model, no agent.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const tool = join(here, '..', 'evals', 'eval-inventory.mjs')
const run = () => JSON.parse(execFileSync(process.execPath, [tool, '--json'], { encoding: 'utf8' }))

test('inventories every case and classifies each', () => {
  const inv = run()
  assert.ok(inv.total >= 95, `expected >= 95 cases, got ${inv.total}`)
  for (const c of inv.cases) {
    assert.ok(['E0A', 'E0B', 'E1', 'E2'].includes(c.tier), `${c.case}: tier ${c.tier}`)
    assert.ok(['NOT_RUN', 'HAS_RECORDED_RESULT'].includes(c.state), `${c.case}: state ${c.state}`)
    assert.equal(c.needsModelToRun, true, `${c.case}: every case needs a model to run its agent`)
  }
})

test('no case is ever marked PASS by the inventory', () => {
  const inv = run()
  assert.ok(!inv.cases.some((c) => c.state === 'PASS'), 'the inventory must never assert a behavioural PASS')
})

test('provider-gated cases 85-88 and 89-95 are documented NOT_RUN', () => {
  const inv = run()
  for (const c of inv.cases) {
    const n = Number((/^(\d+)/.exec(c.case) || [])[1])
    if ((n >= 85 && n <= 88) || (n >= 89 && n <= 95)) {
      assert.equal(c.documentedNotRun, true, `${c.case} must be documented NOT_RUN`)
      assert.equal(c.state, 'NOT_RUN', `${c.case} state must be NOT_RUN`)
    }
  }
})

test('deterministic: two runs produce identical output', () => {
  assert.deepEqual(run(), run())
})
