// Optional TypeChecker layer (1.3): verifies the syntactic symbol origins with a TypeScript Program when asked,
// stays within a file budget, and never replaces the syntactic results when it cannot run.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { fixtures, runTool } from './helpers.mjs'

const tsPaths = join(fixtures, 'ts-paths')
const mono = join(fixtures, 'monorepo')
const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]

test('--typecheck: the compiler agrees with every syntactic origin of the TypeScript importers in ts-paths', () => {
  const { report } = runTool('domain-deps.mjs', [tsPaths, ...semantic, '--typecheck', '--fail-on', 'none'])
  const t = report.analysis.typechecker
  assert.equal(t.requested, true)
  assert.equal(t.enabled, true)
  assert.equal(t.files, 12, 'ts/js files of the fixture (the two .vue files are outside the Program)')
  assert.equal(t.namesChecked, 14)
  assert.equal(t.agreements, 14)
  assert.equal(t.disagreements, 0)
  assert.equal(t.resolvedByChecker, 0)
  assert.equal(t.skippedVueImporters, 4)
  assert.ok(t.durationMs >= 0 && typeof t.heapMb === 'number')
  const total = report.data.edges.filter((e) => e.from === 'src/features/checkout/total.ts' && e.origins)
  assert.ok(total.length >= 3)
  for (const e of total) for (const o of e.origins) assert.equal(o.verifiedBy, 'checker', `${e.specifier} ${o.name}`)
  const vueEdge = report.data.edges.find((e) => e.from === 'src/components/OrderCard.vue' && e.specifier === '#core/orders')
  assert.equal(vueEdge.origins[0].verifiedBy, undefined, '.vue importers keep the syntactic origin only')
  assert.ok(report.notes.some((n) => /type checker: 14 imported name\(s\) verified/.test(n)))
  // the symbol summary is unchanged by verification
  assert.equal(report.summary.symbolResolution.declared, 18)
})

test('--typecheck: a name no file declares stays unresolved for the checker too (monorepo)', () => {
  const { report } = runTool('domain-deps.mjs', [mono, ...semantic, '--typecheck', '--fail-on', 'none'])
  const t = report.analysis.typechecker
  assert.equal(t.enabled, true)
  assert.equal(t.unresolvedByChecker, 1, 'nothingHere')
  assert.equal(t.disagreements, 0)
  assert.ok(t.agreements >= 3)
})

test('--typecheck-max-files: over budget the checker is skipped with a reason and the syntactic origins stand', () => {
  const { code, report } = runTool('domain-deps.mjs', [tsPaths, ...semantic, '--typecheck', '--typecheck-max-files', '2', '--fail-on', 'none'])
  assert.equal(code, 0)
  const t = report.analysis.typechecker
  assert.equal(t.enabled, false)
  assert.match(t.reason, /12 files exceed the --typecheck-max-files budget \(2\)/)
  assert.equal(report.summary.symbolResolution.declared, 18)
  assert.ok(report.notes.some((n) => /type checker requested but not used/.test(n)))
})

test('without --typecheck no Program is created; with the lexical engine the flag is reported as not applicable', () => {
  const plain = runTool('domain-deps.mjs', [tsPaths, ...semantic, '--fail-on', 'none'])
  assert.equal(plain.report.analysis.typechecker, null)
  const lexical = runTool('domain-deps.mjs', [tsPaths, '--engine', 'lexical', '--typecheck', '--fail-on', 'none'])
  assert.equal(lexical.report.analysis.typechecker.enabled, false)
  assert.equal(lexical.report.analysis.typechecker.reason, 'lexical engine')
})
