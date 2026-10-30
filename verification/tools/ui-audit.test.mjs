// Static UI audit (1.4): accessibility and form-quality patterns provable from the markup, with the
// three verification levels, component encapsulation, JSX support and the lexical degradation.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const uiApp = join(fixtures, 'ui-app')
const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]
const truth = JSON.parse(readFileSync(join(uiApp, 'expected-findings.json'), 'utf8'))
const key = (f) => `${f.file}:${f.line} ${f.id} [${f.verification}]`

test('semantic engine: every finding of the ground truth, nothing else, with the expected verification level', () => {
  const { code, report } = runTool('ui-audit.mjs', [uiApp, ...semantic])
  assert.equal(code, 1, 'static findings are confirmed and fail the default --fail-on')
  const got = new Set(report.findings.map(key))
  const want = new Set(truth.findings.map(key))
  assert.deepEqual([...want].filter((k) => !got.has(k)), [], 'false negatives')
  assert.deepEqual([...got].filter((k) => !want.has(k)), [], 'false positives')
  for (const f of truth.cleanFiles) assert.equal(report.findings.filter((x) => x.file === f).length, 0, `${f} must be clean`)
  assert.deepEqual(report.summary.byVerification, truth.totals)
  assert.equal(report.summary.encapsulatedByComponent, truth.counters.encapsulatedByComponent)
  assert.equal(report.summary.browserChecks, truth.counters.browserChecks)
  // levels follow verification
  assert.ok(report.findings.filter((f) => f.verification === 'static').every((f) => f.level === 'confirmed'))
  assert.ok(report.findings.filter((f) => f.verification === 'review').every((f) => f.level === 'heuristic'))
  assert.ok(report.findings.filter((f) => f.verification === 'browser').every((f) => f.level === 'info'))
  assert.ok(report.data.files.every((f) => f.source === 'ast'))
  assert.ok(report.notes.some((n) => /not WCAG conformance/.test(n)))
})

test('JSX components are judged with the same rules (htmlFor, onClick, tabIndex)', () => {
  const { report } = runTool('ui-audit.mjs', [uiApp, ...semantic, '--fail-on', 'none'])
  const card = report.findings.filter((f) => f.file === 'app/components/ui/Card.tsx').map((f) => `${f.line} ${f.id}`).sort()
  assert.deepEqual(card, ['12 form-control-without-label', '13 click-handler-on-non-interactive', '15 positive-tabindex', '9 img-missing-alt'].sort())
})

test('--rules a11y leaves the form rules out; --rules forms keeps only them', () => {
  const a11y = runTool('ui-audit.mjs', [uiApp, ...semantic, '--rules', 'a11y', '--fail-on', 'none'])
  assert.equal(byId(a11y.report, 'form-without-pending-state').length, 0)
  assert.equal(byId(a11y.report, 'form-error-not-associated').length, 0)
  assert.ok(byId(a11y.report, 'img-missing-alt').length >= 1)
  const forms = runTool('ui-audit.mjs', [uiApp, ...semantic, '--rules', 'forms', '--fail-on', 'none'])
  assert.equal(byId(forms.report, 'form-without-pending-state').length, 1)
  assert.equal(byId(forms.report, 'img-missing-alt').length, 0)
  const bad = runTool('ui-audit.mjs', [uiApp, '--rules', 'colors'], { parse: false })
  assert.equal(bad.code, 2)
})

test('lexical engine: the same files are scanned by regex, findings that need the element tree degrade to review and the note says so', () => {
  const { code, report } = runTool('ui-audit.mjs', [uiApp, '--engine', 'lexical', '--fail-on', 'none'])
  assert.equal(code, 0)
  assert.ok(report.data.files.every((f) => f.source === 'lexical'))
  assert.ok(report.notes.some((n) => /lexical engine: template elements were approximated/.test(n)))
  // unlabelled inputs are still reported, but as review (no parent chain to prove the absence of a wrapping label)
  const inputs = report.findings.filter((f) => f.file === 'app/components/forms/BadForm.vue' && f.id === 'form-control-without-label')
  assert.ok(inputs.length >= 4)
  assert.ok(inputs.every((f) => f.verification === 'review'))
  // facts provable from attributes alone stay static
  assert.ok(report.findings.some((f) => f.file === 'app/components/forms/BadForm.vue' && f.id === 'img-missing-alt' && f.verification === 'static'))
  assert.ok(report.findings.some((f) => f.id === 'invalid-role' && f.verification === 'static'))
  // JSX is not scanned lexically
  assert.equal(report.findings.filter((f) => f.file.endsWith('.tsx')).length, 0)
})

test('a clean component produces nothing: labels by for/id and wrapping, aria-labelled buttons, decorative images, associated errors, pending state', () => {
  const { report } = runTool('ui-audit.mjs', [uiApp, ...semantic, '--fail-on', 'none'])
  assert.deepEqual(report.findings.filter((f) => f.file === 'app/components/forms/GoodForm.vue'), [])
})
