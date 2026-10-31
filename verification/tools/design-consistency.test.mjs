// Design consistency audit (1.5 increment 5, block E): literals where the tokens should be, classified as defect,
// heuristic, recommendation, imagery or allowed; the fixture's truth was written before the rules were final and
// every change since is a deliberate one. The reference applications pass with zero defects outside the code that
// predates the contract (the 3D labs) and the library's own copied components.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, here, runTool } from './helpers.mjs'

const app = join(fixtures, 'consistency-app')
const truth = JSON.parse(readFileSync(join(app, 'expected-findings.json'), 'utf8'))
const key = (f) => `${f.file ?? ''}:${f.line ?? ''} ${f.id} ${f.class} ${f.evidence ?? ''}`
const contracts = join(here, '..', 'design', 'contracts')

test('the fixture: every finding of the truth, nothing else, each with its class; defects fail the default --fail-on', () => {
  const { code, report } = runTool('design-consistency.mjs', [app])
  assert.equal(code, 1)
  const got = new Set(report.findings.map(key))
  const want = new Set(truth.findings.map(key))
  assert.deepEqual([...want].filter((k) => !got.has(k)), [], 'false negatives')
  assert.deepEqual([...got].filter((k) => !want.has(k)), [], 'false positives')
  assert.deepEqual(report.summary.byClass, truth.byClass)
  assert.equal(report.summary.distinctLiteralColors, truth.distinctLiteralColors)
  // classes follow levels; imagery and allowed are information
  assert.ok(report.findings.filter((f) => f.class === 'defect').every((f) => f.level === 'confirmed'))
  assert.ok(report.findings.filter((f) => f.class === 'heuristic').every((f) => f.level === 'heuristic'))
  assert.ok(report.findings.filter((f) => ['imagery', 'allowed', 'recommendation'].includes(f.class)).every((f) => f.level === 'info'))
  // the drawing's colours are imagery, the configured exception is allowed, the dynamic bindings carry nothing
  assert.ok(byId(report, 'imagery-literal-color').some((f) => f.evidence === '#ffffff' && f.file === 'app/components/Art.tsx'))
  assert.ok(byId(report, 'allowed-literal-color').some((f) => f.evidence === '#f3efe8'))
  assert.ok(!report.findings.some((f) => f.evidence === 'accent' || f.evidence === 'tint'))
  // the token layer was found, and human judgement is stated as such
  assert.deepEqual(report.summary.tokenLayer, ['app/assets/css/tokens.css'])
  assert.ok(report.notes.some((n) => /human judgement/.test(n)) && report.notes.some((n) => /unverifiable/.test(n)))
})

test('--contract with an 8px base moves the grid: 16px stays on it, 12px falls off it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fa-consistency-'))
  writeFileSync(join(dir, 'contract.json'), JSON.stringify({ name: 'eight', spacing: { base: 8 } }))
  const { report } = runTool('design-consistency.mjs', [app, '--contract', join(dir, 'contract.json'), '--fail-on', 'none'])
  assert.equal(report.summary.gridPx, 8)
  const sizes = Object.fromEntries(report.findings.filter((f) => /size/.test(f.id)).map((f) => [f.evidence, f.id]))
  assert.equal(sizes['px-[16px]'], 'arbitrary-size')
  assert.equal(sizes['py-[12px]'], 'off-grid-size')
  assert.equal(sizes['gap-[8px]'], 'arbitrary-size')
})

test('without a token layer the literals are the system: colours and fonts are heuristic, with a note', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fa-consistency-'))
  mkdirSync(join(dir, 'app', 'components'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'bare', dependencies: { nuxt: '^4.0.0' } }))
  writeFileSync(join(dir, 'app', 'components', 'Drift.vue'), readFileSync(join(app, 'app', 'components', 'Drift.vue'), 'utf8'))
  const { code, report } = runTool('design-consistency.mjs', [dir])
  assert.ok(byId(report, 'literal-color').length > 0 && byId(report, 'literal-color').every((f) => f.level === 'heuristic' && f.class === 'heuristic'))
  assert.ok(byId(report, 'literal-font-family').every((f) => f.level === 'heuristic'))
  assert.ok(report.notes.some((n) => /no token layer/.test(n)))
  // sizes off the grid are still defects: a grid needs no token layer
  assert.ok(byId(report, 'off-grid-size').every((f) => f.level === 'confirmed'))
  assert.equal(code, 1)
})

test('the reference applications: zero defects outside the pre-contract labs and the copied library components', () => {
  const nuxt = runTool('design-consistency.mjs', [join(here, '..', 'nuxt'), '--contract', join(contracts, 'atlas-logistics.json'), '--exclude', 'harness/**,**/lab/**'])
  assert.equal(nuxt.code, 0, JSON.stringify(nuxt.report.findings.filter((f) => f.level === 'confirmed').slice(0, 5)))
  assert.ok(nuxt.report.summary.files >= 30)
  const next = runTool('design-consistency.mjs', [join(here, '..', 'next'), '--contract', join(contracts, 'atlas-logistics.json'), '--exclude', 'harness/**,**/lab/**,**/components/ui/**'])
  assert.equal(next.code, 0, JSON.stringify(next.report.findings.filter((f) => f.level === 'confirmed').slice(0, 5)))
  assert.ok(next.report.summary.files >= 25)
})
