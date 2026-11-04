// impl-quality contracts (1.7 increment 4, Fase 5): adversarial tests of the implementation-quality evaluation system.
// Deterministic, no model, no app run. They prove the contract validator and the axis-aggregation cannot be fooled:
// a non-compiling app is never a functional PASS, a clean axe never passes the visual axis, a missing artifact is
// NOT_RUN, a missing metric is not invented into a pass, over-engineering earns no bonus, the four axes are independent
// and do not mask each other, and the five shipped scenario contracts are well formed.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { validate, scenarioVerdict } from '../impl-quality/validate-contracts.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const scenariosDir = join(here, '..', 'impl-quality', 'scenarios')
const validator = join(here, '..', 'impl-quality', 'validate-contracts.mjs')

// ---- the shipped contracts are valid ----
test('all five scenario contracts validate', () => {
  const out = execFileSync(process.execPath, [validator, '--json'], { encoding: 'utf8' })
  const r = JSON.parse(out)
  assert.equal(r.scenarios, 5)
  for (const s of r.results) assert.equal(s.errors.length, 0, `${s.id}: ${s.errors.join('; ')}`)
})

// ---- adversarial: malformed contracts are rejected ----
const baseContract = () => JSON.parse(readFileSync(join(scenariosDir, 'saas-dashboard.json'), 'utf8'))

test('a visual axis that claims an automated pass is rejected', () => {
  const c = baseContract()
  c.axes.visual = { tier: 'E0A', e0a_accept: 'axe clean and snapshot matches => visual pass' } // no E2, implies autopass
  const errs = validate(c, c.id)
  assert.ok(errs.some((e) => /E2|HUMAN_REVIEW/.test(e)), 'must require an E2 human tier on visual')
})

test('a functional axis that does not key on compile/build is rejected', () => {
  const c = baseContract()
  c.axes.functional = { tier: 'E0A', accept: 'looks done', reject: 'looks unfinished' }
  assert.ok(validate(c, c.id).some((e) => /compile|build|tsc/.test(e)))
})

test('a contract missing an axis is rejected', () => {
  const c = baseContract(); delete c.axes.accessibility
  assert.ok(validate(c, c.id).some((e) => /accessibility missing/.test(e)))
})

test('a driver that is not an existing check script is rejected (no re-implementing checks)', () => {
  const c = baseContract(); c.driver = 'check-does-not-exist.mjs'
  assert.ok(validate(c, c.id).some((e) => /driver .* not found/.test(e)))
})

// ---- adversarial: axis aggregation cannot be fooled ----
test('a non-compiling app is FAIL regardless of a beautiful, accessible, fast result', () => {
  const v = scenarioVerdict({ functional: 'FAIL', accessibility: 'PASS', performance: 'PASS', visual: { e0a: 'PASS', e2: 'PASS' } })
  assert.equal(v, 'FAIL', 'the functional FAIL is not rescued by other axes')
})

test('a clean axe (accessibility PASS) does not produce a visual PASS', () => {
  // everything automated passes; the visual judgement is still human-required
  const v = scenarioVerdict({ functional: 'PASS', accessibility: 'PASS', performance: 'PASS', visual: { e0a: 'PASS', e2: 'HUMAN_REVIEW_REQUIRED' } })
  assert.equal(v, 'HUMAN_REVIEW_REQUIRED', 'a fully-green automated run is still not a visual pass')
})

test('a missing artifact is NOT_RUN, never a pass', () => {
  const v = scenarioVerdict({ functional: 'NOT_RUN', accessibility: 'NOT_RUN', performance: 'NOT_RUN', visual: { e0a: 'NOT_RUN', e2: 'HUMAN_REVIEW_REQUIRED' } })
  assert.equal(v, 'NOT_RUN')
})

test('a missing metric is INSUFFICIENT_EVIDENCE, not invented into a pass', () => {
  const v = scenarioVerdict({ functional: 'PASS', accessibility: 'PASS', performance: 'INSUFFICIENT_EVIDENCE', visual: { e0a: 'PASS', e2: 'HUMAN_REVIEW_REQUIRED' } })
  assert.equal(v, 'INSUFFICIENT_EVIDENCE', 'an unavailable performance metric blocks the scenario verdict, not silently passed')
})

test('an invalid configuration dominates (a contract that cannot be evaluated as written)', () => {
  const v = scenarioVerdict({ functional: 'INVALID_CONFIGURATION', accessibility: 'PASS', performance: 'PASS', visual: { e0a: 'PASS', e2: 'PASS' } })
  assert.equal(v, 'INVALID_CONFIGURATION')
})

test('the fully-correct automated case still caps at human review for visual, never an unqualified PASS', () => {
  // Even if a human later marks visual E2 as PASS, that is a recorded human verdict, not an automated one.
  const automated = scenarioVerdict({ functional: 'PASS', accessibility: 'PASS', performance: 'PASS', visual: { e0a: 'PASS', e2: 'HUMAN_REVIEW_REQUIRED' } })
  assert.notEqual(automated, 'PASS', 'no run without a human visual verdict is a full PASS')
  const withHuman = scenarioVerdict({ functional: 'PASS', accessibility: 'PASS', performance: 'PASS', visual: { e0a: 'PASS', e2: 'PASS' } })
  assert.equal(withHuman, 'PASS', 'only a recorded human visual PASS lets the whole scenario pass')
})

test('over-engineering earns no bonus: extra axes do not raise the verdict above the worst', () => {
  // an "over-engineered" app that still has an architecture defect is FAIL, no matter how polished the rest
  const v = scenarioVerdict({ functional: 'FAIL', accessibility: 'PASS', performance: 'PASS', visual: { e0a: 'PASS', e2: 'PASS' } })
  assert.equal(v, 'FAIL')
})
