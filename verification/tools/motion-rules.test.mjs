// Motion rules of leak-patterns (1.5, increment 2): GSAP calls judged with their AST context on two fixtures whose
// truth was written before the rules ran (verification/tools/fixtures/motion-nuxt, motion-next). The lexical
// engine keeps the 1.3 pair rule only; the five motion rules exist only with the semantic engine.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]
const MOTION_IDS = ['gsap-module-scope-animation', 'gsap-outside-client-lifecycle', 'gsap-effect-without-cleanup', 'scrolltrigger-without-cleanup', 'motion-without-reduced-motion']

function check(fixture) {
  const root = join(fixtures, fixture)
  const truth = JSON.parse(readFileSync(join(root, 'truth.json'), 'utf8'))
  const { code, report } = runTool('leak-patterns.mjs', [root, ...semantic, '--fail-on', 'none'])
  assert.equal(code, 0)
  assert.equal(report.analysis.engine, 'semantic')
  assert.equal(report.summary.motionRules, 'active')
  const motion = report.findings.filter((f) => MOTION_IDS.includes(f.id))
  let expected = 0
  let found = 0
  const problems = []
  for (const [file, exp] of Object.entries(truth.files)) {
    const ids = motion.filter((f) => f.file === file)
    const present = new Set(ids.map((f) => f.id))
    for (const id of exp.must) {
      expected++
      if (present.has(id)) found++
      else problems.push(`${file}: missing ${id}`)
    }
    for (const id of exp.mustNot) if (present.has(id)) problems.push(`${file}: unexpected ${id}`)
    for (const [id, level] of Object.entries(exp.levels ?? {})) for (const f of ids.filter((f) => f.id === id)) if (f.level !== level) problems.push(`${file}: ${id} is ${f.level}, expected ${level}`)
    // precision: every motion finding on this file must be in `must`
    for (const f of ids) if (!exp.must.includes(f.id)) problems.push(`${file}: ${f.id} not in the truth (false positive)`)
  }
  assert.deepEqual(problems, [])
  assert.equal(found, expected)
  assert.equal(motion.length, expected, 'precision 100%: no motion finding outside the truth')
  return { report, motion }
}

test('motion-nuxt: SSR-unsafe setup calls, module-scope timelines, unreverted ScrollTriggers and missing reduced-motion branches are found; guarded, client-only, factory and reverted code is clean', () => {
  const { report, motion } = check('motion-nuxt')
  assert.equal(report.summary.motionFindings, motion.length)
  const setup = byId(report, 'gsap-outside-client-lifecycle')[0]
  assert.match(setup.message, /top level of <script setup>/)
  assert.equal(setup.severity, 'high', 'nuxt with SSR on')
  const leak = byId(report, 'scrolltrigger-without-cleanup').find((f) => /LeakScrollTrigger/.test(f.file))
  assert.match(leak.message, /no revert\(\), kill\(\) or useGSAP/)
  const never = byId(report, 'scrolltrigger-without-cleanup').find((f) => /ContextNeverReverted/.test(f.file))
  assert.equal(never.level, 'heuristic')
  assert.match(never.message, /never reverted/)
  assert.match(byId(report, 'gsap-module-scope-animation')[0].message, /module scope/)
})

test('motion-next: effects without cleanup (with and without deps), render-body tweens, a cleanup that forgets the ScrollTrigger, scrub without reduced motion; useGSAP, reverting effects and contextSafe handlers are clean', () => {
  const { report } = check('motion-next')
  const effects = byId(report, 'gsap-effect-without-cleanup')
  assert.equal(effects.length, 2)
  assert.ok(effects.find((f) => /EffectNoDeps/.test(f.file)).message.includes('every render'))
  assert.ok(!effects.find((f) => /EffectNoCleanup/.test(f.file)).message.includes('every render'))
  assert.ok(effects.every((f) => /Strict Mode/.test(f.message)))
  const render = byId(report, 'gsap-outside-client-lifecycle')[0]
  assert.match(render.message, /render body of RenderBodyTween/)
  assert.equal(render.level, 'heuristic')
  const scroll = byId(report, 'scrolltrigger-without-cleanup')[0]
  assert.match(scroll.file, /ScrollNoCleanup/)
  assert.equal(scroll.level, 'confirmed')
})

test('lexical engine: the motion rules stay silent and the 1.3 pair rule still runs', () => {
  for (const fixture of ['motion-nuxt', 'motion-next']) {
    const { code, report } = runTool('leak-patterns.mjs', [join(fixtures, fixture), '--engine', 'lexical', '--fail-on', 'none'])
    assert.equal(code, 0)
    assert.equal(report.summary.motionRules, 'inactive (lexical engine)')
    assert.equal(report.summary.motionFindings, 0)
    assert.ok(report.findings.every((f) => !MOTION_IDS.includes(f.id)))
    assert.ok(byId(report, 'leak-gsap').length >= 1)
  }
})

test('historical fixtures: the motion rules add nothing on nuxt-app, next-app, ssr-app, ui-app, vue-templates and monorepo', () => {
  for (const fixture of ['nuxt-app', 'next-app', 'ssr-app', 'ui-app', 'vue-templates', 'monorepo']) {
    const { code, report } = runTool('leak-patterns.mjs', [join(fixtures, fixture), ...semantic, '--fail-on', 'none'])
    assert.equal(code, 0, fixture)
    assert.deepEqual(report.findings.filter((f) => MOTION_IDS.includes(f.id)), [], fixture)
  }
})

test('the semantic engine records GSAP calls with effect context (direct check of the records)', async () => {
  const { parseModule } = await import(join(fixtures, '..', '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts', 'lib', 'semantic', 'ts-module.mjs'))
  const { createRequire } = await import('node:module')
  const ts = createRequire(join(vueProject, 'package.json'))('typescript')
  const src = `import gsap from 'gsap'
import { useEffect } from 'react'
export function A() {
  useEffect(() => { gsap.to('.a', { x: 1 }) }, [])
  useEffect(() => { const ctx = gsap.context(() => { gsap.timeline({ scrollTrigger: { trigger: '.b', scrub: 1, pin: true } }) }); return () => ctx.revert() })
  const onClick = () => gsap.to('.c', { repeat: -1 })
  return null
}
`
  const info = parseModule(ts, src, 'A.tsx', { lang: 'tsx' })
  const kinds = info.motionUses.map((u) => `${u.kind}@${u.line}`)
  assert.deepEqual(kinds, ['tween@4', 'context@5', 'timeline@5', 'revert@5', 'tween@6'])
  const [first, , timeline, , handler] = info.motionUses
  assert.deepEqual(first.effect, { hook: 'useEffect', hasCleanupReturn: false, deps: 'empty' })
  assert.deepEqual(timeline.effect, { hook: 'useEffect', hasCleanupReturn: true, deps: 'none' }, 'the enclosing effect, not the gsap.context() wrapper, is the hook that owns the cleanup')
  assert.deepEqual(timeline.flags, { scrollTrigger: true, scrub: true, pin: true, infinite: false })
  assert.equal(handler.flags.infinite, true)
  assert.equal(handler.enclosingFunction, 'onClick')
  assert.equal(handler.effect, null)
})
