// 3D rules of leak-patterns (1.5, increment 3): Three.js constructions and lifecycle calls judged with their AST
// context on two fixtures whose truth was written before the rules ran (verification/tools/fixtures/three-nuxt,
// three-next). The lexical engine keeps the 1.3 `leak-three` pair rule only; the ten 3D rules exist only with the
// semantic engine. The documented code of the verification projects (the engine, the experiences, the labs) must be
// clean under them: that is the false-positive measurement.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]
export const THREE_IDS = ['three-resource-in-frame-loop', 'three-renderer-outside-client-lifecycle', 'three-load-outside-client-lifecycle', 'three-animation-loop-without-stop', 'three-owned-resource-without-dispose', 'three-context-loss-unhandled', 'three-unclamped-pixel-ratio', 'three-material-recompile-in-frame-loop', 'three-uniform-object-in-frame-loop', 'three-competing-animation-drivers']

function check(fixture) {
  const root = join(fixtures, fixture)
  const truth = JSON.parse(readFileSync(join(root, 'truth.json'), 'utf8'))
  const { code, report } = runTool('leak-patterns.mjs', [root, ...semantic, '--fail-on', 'none'])
  assert.equal(code, 0)
  assert.equal(report.analysis.engine, 'semantic')
  assert.equal(report.summary.threeRules, 'active')
  const three = report.findings.filter((f) => THREE_IDS.includes(f.id))
  let expected = 0
  let found = 0
  const problems = []
  for (const [file, exp] of Object.entries(truth.files)) {
    const ids = three.filter((f) => f.file === file)
    const present = new Set(ids.map((f) => f.id))
    for (const id of exp.must) {
      expected++
      if (present.has(id)) found++
      else problems.push(`${file}: missing ${id}`)
    }
    for (const id of exp.mustNot) if (present.has(id)) problems.push(`${file}: unexpected ${id}`)
    for (const [id, level] of Object.entries(exp.levels ?? {})) for (const f of ids.filter((f) => f.id === id)) if (f.level !== level) problems.push(`${file}: ${id} is ${f.level}, expected ${level}`)
    for (const f of ids) if (!exp.must.includes(f.id)) problems.push(`${file}: ${f.id} not in the truth (false positive)`)
  }
  const unknownFiles = [...new Set(three.map((f) => f.file))].filter((f) => !truth.files[f])
  for (const f of unknownFiles) problems.push(`${f}: findings on a file outside the truth`)
  assert.deepEqual(problems, [])
  assert.equal(found, expected)
  assert.equal(report.summary.threeFindings, three.length)
  return { report, three }
}

test('three-nuxt: allocation in the frame loop, setup-level and module-scope renderers, a loop never stopped, missing disposal, unclamped DPR, competing drivers; runtime-style components, TresJS, factories and .client files are clean', () => {
  const { report } = check('three-nuxt')
  const loop = byId(report, 'three-resource-in-frame-loop')
  assert.ok(loop.find((f) => /LoopAllocates/.test(f.file) && /every frame/.test(f.message)))
  assert.ok(loop.find((f) => /LazyInitInLoop/.test(f.file) && f.level === 'heuristic' && /lazy init/.test(f.message)))
  const setup = byId(report, 'three-renderer-outside-client-lifecycle').find((f) => /SetupRenderer/.test(f.file))
  assert.match(setup.message, /top level of <script setup>/)
  assert.equal(setup.severity, 'high')
  const never = byId(report, 'three-animation-loop-without-stop')[0]
  assert.match(never.file, /LoopNeverStopped/)
  assert.match(never.message, /no onBeforeUnmount/)
  const competing = byId(report, 'three-competing-animation-drivers')[0]
  assert.match(competing.message, /camera\.position is tweened by GSAP .* and written by the frame loop/)
})

test('three-next: useFrame allocation, render-body renderer and loader, an effect loop without cleanup, uniform boxes and recompiles per frame, competing drivers; effects with full cleanup, declarative R3F and a cleanup stack are clean', () => {
  const { report } = check('three-next')
  const effectLoop = byId(report, 'three-animation-loop-without-stop')[0]
  assert.match(effectLoop.file, /EffectNoCleanupLoop/)
  assert.match(effectLoop.message, /returns no cleanup/)
  assert.match(effectLoop.message, /Strict Mode/)
  const body = byId(report, 'three-renderer-outside-client-lifecycle').find((f) => /RenderBodyRenderer/.test(f.file))
  assert.equal(body.level, 'heuristic')
  assert.match(body.message, /render body of RenderBodyRenderer/)
  const load = byId(report, 'three-load-outside-client-lifecycle')[0]
  assert.match(load.file, /LoaderInRender/)
  const frame = byId(report, 'three-resource-in-frame-loop')[0]
  assert.match(frame.message, /useFrame/)
})

test('lexical engine: the 3D rules stay silent and the 1.3 pair rule still runs', () => {
  for (const fixture of ['three-nuxt', 'three-next']) {
    const { code, report } = runTool('leak-patterns.mjs', [join(fixtures, fixture), '--engine', 'lexical', '--fail-on', 'none'])
    assert.equal(code, 0)
    assert.equal(report.summary.threeRules, 'inactive (lexical engine)')
    assert.equal(report.summary.threeFindings, 0)
    assert.ok(report.findings.every((f) => !THREE_IDS.includes(f.id)))
    assert.ok(byId(report, 'leak-three').length >= 1)
  }
})

test('historical and motion fixtures: the 3D rules add nothing', () => {
  for (const fixture of ['nuxt-app', 'next-app', 'ssr-app', 'ui-app', 'vue-templates', 'monorepo', 'motion-nuxt', 'motion-next']) {
    const { code, report } = runTool('leak-patterns.mjs', [join(fixtures, fixture), ...semantic, '--fail-on', 'none'])
    assert.equal(code, 0, fixture)
    assert.deepEqual(report.findings.filter((f) => THREE_IDS.includes(f.id)), [], fixture)
  }
})

test('false positives on the documented code: the engine, the experiences and the labs of the verification projects are clean (when extracted)', () => {
  const projects = ['creative', 'nuxt', 'next'].map((p) => join(fixtures, '..', '..', p)).filter((p) => existsSync(join(p, p.endsWith('nuxt') ? 'app' : 'src', 'lib')) || existsSync(join(p, 'src', 'engine')))
  assert.ok(projects.length >= 1, 'run node verification/extract.mjs first')
  for (const project of projects) {
    const { code, report } = runTool('leak-patterns.mjs', [project, ...semantic, '--fail-on', 'none'])
    assert.equal(code, 0, project)
    const three = report.findings.filter((f) => THREE_IDS.includes(f.id))
    assert.deepEqual(three.map((f) => `${f.file}:${f.line} ${f.id}`), [], project)
    // the engine did look at the code: records exist where Three.js is used
    assert.ok(report.summary.filesScanned > 10, project)
  }
})
