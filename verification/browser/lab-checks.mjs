// Browser checks for the 3D lab pages (1.5, increment 3): shader compilation and rendering, GPU particle simulation,
// and the three reference experiences. Run as a child process by verification/next/check-lab.mjs and
// verification/nuxt/check-lab.mjs against the built apps. Every assertion reads the diagnostics each lab publishes on
// `window.__lab` (pixel read-backs, renderer.info counts, camera positions, uniform values, loop state); screenshots
// are written as visual evidence next to the measurements, never used as the assertion.
//
//   node lab-checks.mjs --url http://127.0.0.1:3000 --label next --pages shaders [--evidence ./evidence]
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance

async function readLab(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__lab ?? null)))
}

async function openLab(page, url, path) {
  await page.goto(`${url}${path}`, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__lab) && window.__lab.ready === true, null, { timeout: 240000 }) // software rendering is slow: minutes, not seconds
  return readLab(page)
}

/** Navigates away through the primary navigation (a client-side route change) and returns the diagnostics after it. */
async function leave(page, url, linkName) {
  await page.getByRole('link', { name: linkName, exact: true }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/lab/'), { timeout: 20000 })
  await page.waitForTimeout(400)
  return readLab(page)
}

const checks = {
  async shaders({ page, url, label, evidence, consoleProblems, ok }) {
    const d = await openLab(page, url, '/lab/shaders')
    expect(d.errors.length === 0, `console.error during the lab: ${d.errors.slice(0, 3).join(' | ')}`)
    expect(d.programs.failed.length === 0 && d.programs.total >= 7, `every program runnable (${d.programs.runnable}/${d.programs.total}, failed ${d.programs.failed.join(',')})`)
    ok(`shaders: ${d.programs.total} WebGL programs compiled and linked`)
    const names = d.materials.map((m) => m.name)
    expect(names.length === 7, `seven material probes (${names.join(',')})`)
    for (const m of d.materials) expect(m.coverage > 0.2, `${m.name} renders a visible shape (coverage ${m.coverage.toFixed(2)})`)
    const means = new Set(d.materials.map((m) => m.mean.map((v) => Math.round(v / 8)).join(',')))
    expect(means.size >= 5, `materials render different colours (${means.size} distinct means)`)
    ok('shaders: every GLSL material renders a non-empty, distinct image (64×64 read-back)')
    expect(d.dissolve.atZero > 0.3 && d.dissolve.atOne === 0 && d.dissolve.atHalf > 0 && d.dissolve.atHalf < d.dissolve.atZero, `dissolve sweeps coverage ${d.dissolve.atZero.toFixed(2)} → ${d.dissolve.atHalf.toFixed(2)} → ${d.dissolve.atOne}`)
    ok('shaders: dissolve discards nothing at 0, part at 0.5, everything at 1')
    for (const t of d.transitions) {
      const [r0, , b0] = t.atZero
      const [r1, , b1] = t.atOne
      expect(r0 > 200 && b0 < 40, `${t.mode} at 0 shows scene A (${t.atZero.map(Math.round)})`)
      expect(b1 > 200 && r1 < 40, `${t.mode} at 1 shows scene B (${t.atOne.map(Math.round)})`)
      const [rh, , bh] = t.atHalf
      expect(rh > 30 && bh > 30, `${t.mode} at 0.5 mixes both (${t.atHalf.map(Math.round)})`)
    }
    ok(`transitions: ${d.transitions.length} modes show A at 0, B at 1, a mix at 0.5`)
    expect(d.post.length === 4 && d.post.every((p) => p.rendered), `four post tiers rendered (${d.post.map((p) => `${p.tier}:${p.rendered}`).join(' ')})`)
    const cinematic = d.post.find((p) => p.tier === 'cinematic')
    const minimal = d.post.find((p) => p.tier === 'minimal')
    expect(cinematic.passes > minimal.passes, `cinematic enables more passes than minimal (${cinematic.passes} vs ${minimal.passes})`)
    expect(minimal.width < cinematic.width, `minimal renders smaller targets (${minimal.width} vs ${cinematic.width})`)
    ok('post: composer renders at every tier; tiers change passes and target size')
    expect(d.tsl.error === null, `TSL renderer ran (${d.tsl.error})`)
    expect(d.tsl.backend === 'webgl2', `WebGPURenderer on its WebGL 2 backend (${d.tsl.backend})`)
    expect(d.tsl.materials.length === 3 && d.tsl.materials.every((m) => m.coverage > 0.2), `three TSL materials render (${d.tsl.materials.map((m) => `${m.name}:${m.coverage.toFixed(2)}`).join(' ')})`)
    ok('tsl: node materials compile and render on the WebGL 2 backend (real WebGPU not available here)')
    expect(d.runtime.running === true && d.runtime.frames >= 1, `runtime loop running (${d.runtime.frames} frames)`)
    await page.screenshot({ path: join(evidence, `${label}-shaders.png`) })
    const after = await leave(page, url, 'Second')
    expect(after.disposed === true, 'lab disposed on route change')
    const floor = after.rendererBaseline
    expect(after.afterDispose.geometries === floor.geometries && after.afterDispose.textures === floor.textures, `no GPU resource left after dispose beyond the renderer's own ${floor.textures} placeholder texture(s) (geometries ${after.afterDispose.geometries}, textures ${after.afterDispose.textures}; trace ${after.disposeTrace.map((t) => `${t.step}:${t.textures}t`).join(' → ')})`)
    ok(`lifecycle: route change disposes every geometry and texture (renderer baseline ${floor.textures} texture(s) kept by the renderer itself)`)
    expect(consoleProblems.length === 0, `console problems: ${consoleProblems.join(' | ')}`)
    return { programs: d.programs.total, materials: d.materials, dissolve: d.dissolve, post: d.post, tsl: d.tsl }
  },
}

checks.particles = async function particles({ page, url, label, evidence, consoleProblems, ok }) {
  const d = await openLab(page, url, '/lab/particles')
  expect(d.errors.length === 0, `console.error during the lab: ${d.errors.slice(0, 3).join(' | ')}`)
  expect(d.floatTargets === true, 'EXT_color_buffer_float available (float render targets for the simulation)')
  const g = d.gpgpu
  expect(g.finite === true, 'every position read back from the float target is finite')
  expect(g.meanSettled < g.meanStart * 0.15, `attraction pulls the cloud onto formation A (mean distance ${g.meanStart.toFixed(3)} → ${g.meanSettled.toFixed(3)})`)
  expect(g.meanMorphed < 0.15, `at uMorph 1 the particles sit on formation B, sampled from the torus knot (mean distance ${g.meanMorphed.toFixed(3)})`)
  expect(g.nearPointerBefore > 0 && g.nearPointerAfter < g.nearPointerBefore * 0.5, `the pointer empties its radius (${g.nearPointerBefore} → ${g.nearPointerAfter} particles within 0.6)`)
  ok(`gpgpu: ${g.count} particles in ${g.side}² float textures, ${g.steps} steps read back: converge, morph, react to the pointer`)
  const rows = d.bench
  expect(rows.length === 9 && rows.every((r) => r.frames >= 25), `nine measured configurations (${rows.map((r) => `${r.mode}@${r.count}:${r.frames}`).join(' ')})`)
  const by = (mode, count) => rows.find((r) => r.mode === mode && r.count === count)
  const cpuSmall = by('cpu', 4096)
  const cpuLarge = by('cpu', 65536)
  const gpuSmall = by('gpgpu', 4096)
  const gpuLarge = by('gpgpu', 65536)
  const instLarge = by('instanced', 65536)
  expect(cpuLarge.jsMs > cpuSmall.jsMs * 4, `CPU JavaScript time grows with the count (${cpuSmall.jsMs.toFixed(2)} ms at 4k → ${cpuLarge.jsMs.toFixed(2)} ms at 65k)`)
  expect(gpuLarge.jsMs < cpuLarge.jsMs * 0.25, `GPGPU JavaScript time stays small at 65k (${gpuLarge.jsMs.toFixed(2)} ms vs CPU ${cpuLarge.jsMs.toFixed(2)} ms)`)
  expect(instLarge.jsMs < cpuLarge.jsMs * 0.25, `instanced JavaScript time stays small at 65k (${instLarge.jsMs.toFixed(2)} ms)`)
  expect(gpuLarge.jsMs < gpuSmall.jsMs * 4 + 1, `GPGPU JavaScript time does not scale with the count (${gpuSmall.jsMs.toFixed(2)} → ${gpuLarge.jsMs.toFixed(2)} ms)`)
  // whole-frame counts (the runtime resets renderer.info once per frame): the GPGPU system is two compute passes plus
  // one draw, the instanced field and the CPU baseline one draw each
  for (const r of rows) expect(r.drawCalls <= (r.mode === 'gpgpu' ? 3 : 1), `${r.mode}@${r.count} draws in ${r.mode === 'gpgpu' ? 'one call plus two compute passes' : 'one call'} (${r.drawCalls})`)
  ok(`comparison: CPU ${cpuSmall.jsMs.toFixed(2)}→${cpuLarge.jsMs.toFixed(2)} ms JS/frame from 4k to 65k; GPGPU ${gpuSmall.jsMs.toFixed(2)}→${gpuLarge.jsMs.toFixed(2)}; instanced ${by('instanced', 4096).jsMs.toFixed(2)}→${instLarge.jsMs.toFixed(2)}; one draw call each plus two compute passes for GPGPU (software renderer: ${d.renderer.slice(0, 40)})`)
  const a = d.adaptive
  expect(a.tiers.length >= 1 && a.finalTier, `controller ran on real frame times (tiers ${a.tiers.join('→')}, average ${a.average.toFixed(1)} ms)`)
  const tier = { ultra: 1, high: 0.6, medium: 0.35, low: 0.15, floor: 0.05 }[a.finalTier]
  expect(near(a.finalDrawn, Math.round(a.fullCount * tier), 1), `the tier sets the drawn count (${a.finalDrawn} of ${a.fullCount} at ${a.finalTier})`)
  ok(`adaptive: ${a.tiers.join(' → ')}, drawing ${a.finalDrawn} particles at pixel ratio ${a.pixelRatio}`)
  const c = d.contextLoss
  expect(c.supported, 'WEBGL_lose_context available')
  expect(c.lost === 1 && c.restored === 1, `one loss and one restore observed (${c.lost}/${c.restored})`)
  expect(c.framesWhileLost <= 2, `the loop stopped while the context was lost (${c.framesWhileLost} frames)`)
  expect(c.rebuilt === true && c.framesAfterRestore >= 2, `the system was rebuilt and the loop resumed after restore (${c.framesAfterRestore} frames)`)
  ok('context loss: loop stopped on loss, simulation rebuilt and loop resumed on restore')
  expect(d.runtime.running === true, 'runtime running at the end')
  await page.screenshot({ path: join(evidence, `${label}-particles.png`) })
  const after = await leave(page, url, 'Second')
  expect(after.disposed === true, 'lab disposed on route change')
  const floor = after.rendererBaseline
  expect(after.afterDispose.geometries === 0 && after.afterDispose.textures <= floor.textures, `no GPU resource left after dispose beyond the renderer's own placeholder(s) (geometries ${after.afterDispose.geometries}, textures ${after.afterDispose.textures}, baseline ${floor.textures})`)
  ok('lifecycle: route change disposes every geometry and texture')
  expect(consoleProblems.length === 0, `console problems: ${consoleProblems.join(' | ')}`)
  return { renderer: d.renderer, gpgpu: d.gpgpu, bench: d.bench, adaptive: d.adaptive, contextLoss: d.contextLoss }
}

import { decodePng } from '../../plugins/frontend-architect/skills/frontend-architect/scripts/lib/png.mjs'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { collectTextRecords, cropPixels, evaluateFocusIndicator, evaluateText, hideTextIn } from './lib/legibility.mjs'

/**
 * Legibility of every visible text under <main> in one state of the page, graded per WCAG 2.2 (4.5:1, or 3:1 for large
 * text) with the strongest proof available: exact from CSS on an opaque chain, a bound over every possible canvas
 * colour under a translucent scrim, and a capture with the text hidden as the observed value (lib/legibility.mjs).
 * Transitional records (an ancestor mid-fade) are kept apart. The hidden-text capture goes to a temp file: the evidence
 * folder keeps the frames a person looks at.
 */
async function measureLegibility(page, state) {
  const records = await page.evaluate(collectTextRecords, 'main')
  await page.evaluate(hideTextIn, { selectors: ['main'], on: true })
  const shot = join(tmpdir(), `fa-legibility-${process.pid}-${Date.now()}.png`)
  await page.screenshot({ path: shot })
  await page.evaluate(hideTextIn, { on: false })
  const image = decodePng(readFileSync(shot))
  rmSync(shot, { force: true })
  const results = records.map((r) => ({ ...evaluateText(r, cropPixels(image, r.rect)), tag: r.tag, rect: r.rect }))
  return { state, results }
}

const describeText = (r) => `${r.selector.split(' > ').slice(-2).join(' > ')} "${r.text.slice(0, 28)}" ${r.ratio}:1 < ${r.required}:1 (${r.method}${r.observed ? `, observed p05 ${r.observed.p05}` : ''})`

/**
 * Grades one measured state: every non-transitional text meets its ratio by CSS or by the bound (a capture alone is
 * reported, never accepted as proof for the lab pages), and no interactive control is caught mid-fade.
 */
function gradeLegibility(measured, where) {
  const graded = measured.results.filter((r) => !r.transitional)
  const failing = graded.filter((r) => !r.passes || r.method === 'estimate')
  expect(failing.length === 0, `${where}: text below its WCAG ratio or proven only by a capture: ${failing.slice(0, 4).map(describeText).join(' | ')}`)
  const fadingControls = measured.results.filter((r) => r.transitional && r.interactive)
  expect(fadingControls.length === 0, `${where}: interactive control mid-fade: ${fadingControls.map((r) => r.selector).join(', ')}`)
  const by = { css: 0, bound: 0, estimate: 0 }
  for (const r of graded) by[r.method] = (by[r.method] ?? 0) + 1
  const worst = graded.reduce((w, r) => (r.ratio !== null && (w === null || r.ratio / r.required < w.ratio / w.required) ? r : w), null)
  return { texts: graded.length, transitional: measured.results.length - graded.length, by, worst: worst ? { text: worst.text.slice(0, 28), ratio: worst.ratio, required: worst.required, method: worst.method, observed: worst.observed?.p05 ?? null } : null }
}

/**
 * Focus indicators (SC 1.4.11 for author rings; a user-agent ring is exempt): Tab through the document until every
 * focusable inside <main> has been visited once (or 40 presses), grade the ring of each.
 */
async function measureFocus(page, limit = 40) {
  const visited = []
  const seen = new Set()
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const main = document.querySelector('main')
      return { inMain: Boolean(main && main.contains(el)), tag: el.tagName.toLowerCase(), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), key: `${el.tagName}|${[...el.attributes].map((a) => `${a.name}=${a.value}`).join(';')}` }
    })
    if (!focused || seen.has(focused.key)) { if (focused && seen.has(focused.key)) break; continue }
    seen.add(focused.key)
    if (!focused.inMain) continue
    const record = (await page.evaluate(collectTextRecords, 'main')).find((r) => r.focused)
    const ring = record ? evaluateFocusIndicator(record) : { method: 'css', indicator: 'unknown', passes: false, note: 'focused element has no text record' }
    visited.push({ tag: focused.tag, text: focused.text, ...ring })
  }
  return visited
}

const api = (page, call) => page.evaluate((c) => {
  const lab = window.__lab
  const fn = lab.api[c.name]
  const result = fn(...c.args)
  return JSON.parse(JSON.stringify(result ?? null))
}, call)
const closeTo = (p, q, tolerance) => Math.abs(p.x - q.x) <= tolerance && Math.abs(p.y - q.y) <= tolerance && Math.abs(p.z - q.z) <= tolerance
const fmt = (p) => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`
const snapshot = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__lab.diagnostics())))
/** Waits until a diagnostics field stops changing (three equal reads, 150 ms apart) or 5 s pass, then returns the snapshot. */
async function settled(page, read) {
  let last = null
  let stable = 0
  for (let i = 0; i < 34 && stable < 3; i++) {
    await page.waitForTimeout(150)
    const value = JSON.stringify(read(await snapshot(page)))
    stable = value === last ? stable + 1 : 0
    last = value
  }
  return snapshot(page)
}

/** Captions cross-fade over 0.4 s: evidence shows the settled frame, not a frame of the fade. */
const settledCaption = (page) => page.waitForFunction(() => {
  const el = document.querySelector('[data-caption][data-active="true"], .caption, [data-caption]')
  return !el || getComputedStyle(el).opacity === '1'
}, null, { timeout: 2000 }).catch(() => {})

/** Shared tail: scroll binding, screenshots, disposal, re-entry and reduced motion for an experience page. */
async function experienceTail({ page, browser, url, label, path, evidence, consoleProblems, ok, name, reducedCheck, allowedTextures = 1, metricsSink = {} }) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5))
  await page.waitForTimeout(900)
  const scrolled = await api(page, { name: 'scrollProgress', args: [] })
  expect(scrolled > 0.2 && scrolled < 0.8, `scroll drives the progress through the scrub (${scrolled.toFixed(2)} at half the page)`)
  ok(`${name}: scroll scrubs the progress (${scrolled.toFixed(2)} at mid-page)`)
  const legibility = []
  const summaries = []
  for (const p of [0, 0.5, 1]) {
    await api(page, { name: 'seek', args: [p] })
    // a simulation gets three seconds of fixed steps so the evidence shows a settled state, not the first frame after the seek
    await page.evaluate(() => (window.__lab.api.advance ? window.__lab.api.advance(3) : null))
    await page.waitForTimeout(250)
    await settledCaption(page)
    await page.screenshot({ path: join(evidence, `${label}-${name}-${p}.png`) })
    const measured = await measureLegibility(page, `progress:${p}`)
    legibility.push(measured)
    summaries.push({ state: measured.state, ...gradeLegibility(measured, `${name} at progress ${p}`) })
  }
  // mid-fade: captions cross-fade over 0.4 s; the fading text is recorded, not graded, and no control may be fading
  await api(page, { name: 'seek', args: [0] })
  await settledCaption(page)
  await api(page, { name: 'seek', args: [0.5] })
  await page.waitForTimeout(120)
  const midFade = await measureLegibility(page, 'mid-fade')
  legibility.push(midFade)
  summaries.push({ state: 'mid-fade', ...gradeLegibility(midFade, `${name} mid-fade`) })
  // focus indicators of every control inside <main>
  await api(page, { name: 'seek', args: [0] })
  const focus = await measureFocus(page)
  const badRings = focus.filter((f) => !f.passes)
  expect(badRings.length === 0, `${name}: focus indicator below 3:1 or missing: ${badRings.map((f) => `${f.tag} "${f.text}" (${f.indicator}${f.ratio ? ` ${f.ratio}:1` : ''})`).join(', ')}`)
  const fmtState = (s) => `${s.state}: ${s.texts} texts, ${s.by.css} css / ${s.by.bound} bound${s.transitional ? `, ${s.transitional} fading` : ''}, worst ${s.worst ? `${s.worst.ratio}:1 for ${s.worst.required}:1${s.worst.observed ? ` (observed ${s.worst.observed}:1)` : ''}` : 'n/a'}`
  ok(`${name}: legibility ${summaries.map(fmtState).join('; ')}; focus rings ${focus.length} (${focus.filter((f) => f.indicator === 'author').length} author, ${focus.filter((f) => f.indicator === 'user-agent').length} user-agent)`)
  metricsSink.legibility = { states: legibility, summaries, focus }
  // the same sweep before both samples: geometries upload lazily the first time a space or a transition renders
  const sweep = async () => {
    for (const p of [0, 0.34, 0.5, 0.68, 1]) {
      await api(page, { name: 'seek', args: [p] })
      await page.waitForTimeout(200)
    }
  }
  await sweep()
  const lifecycleBefore = await page.evaluate(() => JSON.parse(JSON.stringify(window.__labLifecycle)))
  const firstStats = await page.evaluate(() => JSON.parse(JSON.stringify(window.__lab.diagnostics().stats.info)))
  const after = await leave(page, url, 'Second')
  expect(after.disposed === true, 'experience disposed on route change')
  expect(after.lifecycle.mounts === after.lifecycle.disposes, `every mount was disposed (${after.lifecycle.mounts}/${after.lifecycle.disposes})`)
  expect(after.afterDispose.geometries === 0 && after.afterDispose.textures <= allowedTextures, `GPU memory back to the renderer's own after dispose (geometries ${after.afterDispose.geometries}, textures ${after.afterDispose.textures}, allowed ${allowedTextures}; disposal ${JSON.stringify(after.disposal)})`)
  ok(`${name}: route change disposes (mounts ${after.lifecycle.mounts}, disposes ${after.lifecycle.disposes})`)
  await page.goBack({ waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__lab) && window.__lab.ready === true && window.__lab.disposed === false, null, { timeout: 120000 })
  await sweep()
  const second = await page.evaluate(() => JSON.parse(JSON.stringify({ stats: window.__lab.diagnostics().stats.info, lifecycle: window.__labLifecycle })))
  expect(second.lifecycle.mounts > lifecycleBefore.mounts, `re-entry mounted again (${second.lifecycle.mounts})`)
  // geometries are deterministic; textures are sampled at an arbitrary frame (SMAA's lookup images load asynchronously,
  // the transmission target appears on the first transmissive render), so a difference of up to two is timing, not growth
  expect(second.stats.geometries === firstStats.geometries && Math.abs(second.stats.textures - firstStats.textures) <= 2, `re-entry has the same resource counts (${second.stats.geometries}g/${second.stats.textures}t vs ${firstStats.geometries}g/${firstStats.textures}t)`)
  ok(`${name}: re-entry recreates the experience with equal counts (${second.stats.geometries} geometries, ${second.stats.textures} textures)`)
  await leave(page, url, 'Second')
  expect(consoleProblems.length === 0, `console problems: ${consoleProblems.join(' | ')}`)
  const reduced = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  const rp = await reduced.newPage()
  await openLab(rp, url, path)
  const diag = await snapshot(rp)
  expect(diag.reducedMotion === true, 'reduced motion branch taken')
  expect(diag.stats.running === true, 'the loop keeps running under reduced motion (interaction stays alive)')
  await rp.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5))
  await rp.waitForTimeout(600)
  const reducedScroll = await api(rp, { name: 'scrollProgress', args: [] })
  expect(reducedScroll === 0, `no scrub under reduced motion (scroll progress ${reducedScroll})`)
  if (reducedCheck) await reducedCheck(rp)
  ok(`${name}: reduced motion keeps the scene interactive without scroll-driven motion`)
  await reduced.close()
}

checks.product = async function product(ctx) {
  const { page, url } = ctx
  const d = await openLab(page, url, '/lab/product')
  expect(d.errors.length === 0, `console.error during mount: ${d.errors.slice(0, 3).join(' | ')}`)
  const shots = d.shots
  const at0 = await api(page, { name: 'seek', args: [0] })
  expect(closeTo(at0.camera, shots[0].position, 1e-3) && at0.camera.fov === shots[0].fov, `progress 0 lands on "${shots[0].name}" ${fmt(shots[0].position)} fov ${shots[0].fov} (got ${fmt(at0.camera)} fov ${at0.camera.fov})`)
  expect(at0.cues.includes('caption:establishing') && !at0.cues.includes('caption:cap'), `establishing caption active at 0 (${at0.cues.join(',')})`)
  const capHold = d.segments.find((s) => s.name === 'cap:hold')
  const atCap = await api(page, { name: 'seek', args: [capHold.start + 0.01] })
  expect(closeTo(atCap.camera, shots[1].position, 1e-3), `the cap hold keeps the camera on "cap" ${fmt(shots[1].position)} (got ${fmt(atCap.camera)})`)
  expect(atCap.cues.includes('caption:cap') && atCap.cues.includes('focus:cap'), `cap caption and focus cue active (${atCap.cues.join(',')})`)
  const capDistance = Math.hypot(shots[1].position.x, shots[1].position.y - 3, shots[1].position.z)
  expect(near(atCap.focus, capDistance, 1e-3), `depth of field focus moved to the cap (${atCap.focus.toFixed(3)} vs ${capDistance.toFixed(3)})`)
  expect(atCap.keyIntensity > 2.2, `the key light rises on the close-up (${atCap.keyIntensity.toFixed(2)})`)
  const at1 = await api(page, { name: 'seek', args: [1] })
  expect(closeTo(at1.camera, shots[3].position, 1e-3) && at1.camera.fov === shots[3].fov, `progress 1 lands on "${shots[3].name}" (got ${fmt(at1.camera)})`)
  expect(at1.cues.includes('caption:reverse') && !at1.cues.includes('caption:establishing'), `reverse caption active at 1 (${at1.cues.join(',')})`)
  const back = await api(page, { name: 'seek', args: [0] })
  expect(closeTo(back.camera, shots[0].position, 1e-6), 'seeking back to 0 reproduces the first shot exactly')
  const establishingDistance = Math.hypot(shots[0].position.x - 0, shots[0].position.y - 1.4, shots[0].position.z - 0)
  expect(near(back.focus, establishingDistance, 1e-3) && back.cues.includes('focus:establishing') && !back.cues.includes('focus:reverse'), `seeking back restores the establishing focus (${back.focus.toFixed(3)} vs ${establishingDistance.toFixed(3)}; cues ${back.cues.join(',')})`)
  ctx.ok('product: camera lands on the four documented shots; captions, focus and key light follow the cues in both directions')
  const captionsActive = await page.evaluate(() => [...document.querySelectorAll('[data-caption][data-active="true"]')].map((e) => e.getAttribute('data-caption')))
  expect(captionsActive.length === 1 && captionsActive[0] === 'establishing', `one DOM caption active at 0 (${captionsActive.join(',')})`)
  await page.selectOption('select[data-option="color"]', 'rose')
  let diag = await settled(page, (d) => d.capColor)
  const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  const sameColour = (a, b) => [0, 1, 2].every((i) => Math.abs(channel(a, i) - channel(b, i)) <= 2) // the tween lands within float rounding
  expect(diag.selection.color === 'rose' && sameColour(diag.capColor, d.colors.rose), `the colour select recolours the collar through a tween (${diag.capColor} vs ${d.colors.rose})`)
  expect((await api(page, { name: 'set', args: ['color', 'nope'] })) === false, 'an unknown value is refused')
  await api(page, { name: 'set', args: ['finish', 'polished'] })
  diag = await snapshot(page)
  expect(diag.selection.finish === 'polished', 'finish set through the api')
  ctx.ok('product: configurator changes colour (tweened) and finish from the DOM and the api')
  const explore = await api(page, { name: 'explore', args: [] })
  expect(explore.exploring === true && explore.owners['camera.position'] === 'orbit-controls', `explore mode: orbit controls own the camera (${JSON.stringify(explore.owners)})`)
  expect((await api(page, { name: 'scrubPaused', args: [] })) === true, 'explore mode pauses the scroll scrub')
  const progressBefore = explore.progress
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.6))
  await page.waitForTimeout(700)
  const whileExploring = await snapshot(page)
  expect(whileExploring.exploring === true && whileExploring.progress === progressBefore, `scrolling while exploring does not move the sequence (progress ${whileExploring.progress} vs ${progressBefore})`)
  const resumed = await api(page, { name: 'resume', args: [] })
  expect(resumed.exploring === false && resumed.owners['camera.position'] === 'camera-rig', `resume hands the camera back to the rig (${JSON.stringify(resumed.owners)})`)
  expect((await api(page, { name: 'scrubPaused', args: [] })) === false, 'resume re-enables the scrub')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)
  ctx.ok('product: explore mode hands the camera to the controls and pauses the scrub; resume hands both back')
  expect(diag.stats.info.calls <= 40, `draw calls within budget (${diag.stats.info.calls})`)
  expect(d.tier.pinned === 'medium', `tier pinned for the lab (${d.tier.pinned}, heuristic would pick ${d.tier.detected})`)
  // allowed after dispose: the renderer's placeholder sampler and the transmission render target three keeps in its
  // render state (renderer.dispose() drops the state without disposing it; the context release frees the GPU memory)
  const sink = {}
  await experienceTail({ ...ctx, path: '/lab/product', name: 'product', allowedTextures: 2, metricsSink: sink })
  return { shots, tier: d.tier, drawCalls: diag.stats.info.calls, stats: diag.stats.info, legibility: sink.legibility }
}

checks.field = async function field(ctx) {
  const { page, url } = ctx
  const d = await openLab(page, url, '/lab/field')
  expect(d.errors.length === 0, `console.error during mount: ${d.errors.slice(0, 3).join(' | ')}`)
  let diag = await api(page, { name: 'seek', args: [0] })
  expect(diag.mode === 'gpgpu', `float targets available: GPGPU mode (${diag.mode})`)
  // the simulation is advanced in fixed steps so the result does not depend on the frame rate of the test machine;
  // the resting turbulence (curl 0.6) keeps the particles hovering around their targets, hence the tolerance
  await api(page, { name: 'advance', args: [4] })
  const onA = await api(page, { name: 'measure', args: ['a'] })
  expect(onA.mean < 0.5, `particles settle on formation A at progress 0 (mean distance ${onA.mean.toFixed(3)} after 4 s of simulation)`)
  diag = await api(page, { name: 'seek', args: [0.55] })
  expect(diag.curl > 2 && diag.morph > 0 && diag.morph < 1, `mid-progress scatters (curl ${diag.curl.toFixed(2)}, morph ${diag.morph.toFixed(2)})`)
  await api(page, { name: 'advance', args: [1] })
  const scattered = await api(page, { name: 'measure', args: ['a'] })
  expect(scattered.mean > onA.mean * 1.5, `the scatter phase lifts the particles off their formation (mean ${scattered.mean.toFixed(3)} vs ${onA.mean.toFixed(3)})`)
  diag = await api(page, { name: 'seek', args: [1] })
  expect(diag.morph === 1 && diag.curl < 1, `progress 1: morph complete, turbulence low (curl ${diag.curl.toFixed(2)})`)
  await api(page, { name: 'advance', args: [5] })
  const onB = await api(page, { name: 'measure', args: ['b'] })
  expect(onB.mean < 0.5, `particles settle on the emblem at progress 1 (mean distance ${onB.mean.toFixed(3)} after 5 s of simulation)`)
  ctx.ok(`field: ${diag.count} particles (${diag.side}²) sit on the sphere at 0 and on the emblem at 1 (read-back means ${onA.mean.toFixed(3)} / ${onB.mean.toFixed(3)})`)
  const probe = { x: 1.6, y: 0, z: 0, radius: 0.9 }
  const before = await api(page, { name: 'measure', args: ['b', probe] })
  await api(page, { name: 'setPointer', args: [probe.x, probe.y, probe.z, true] })
  await api(page, { name: 'advance', args: [1.5] })
  const afterPush = await api(page, { name: 'measure', args: ['b', probe] })
  expect(before.near > 20 && afterPush.near < before.near * 0.5, `the pointer empties its radius (${before.near} → ${afterPush.near} within ${probe.radius})`)
  await api(page, { name: 'setPointer', args: [0, 0, 0, false] })
  ctx.ok(`field: pointer pushes particles out of its radius (${before.near} → ${afterPush.near})`)
  const dense = await api(page, { name: 'setDensity', args: [0.1] })
  expect(dense.drawn === Math.round(dense.count * 0.1), `density 0.1 draws ${dense.drawn} of ${dense.count}`)
  await page.fill('input[data-density]', '50')
  await page.dispatchEvent('input[data-density]', 'input')
  const half = await snapshot(page)
  expect(half.drawn === Math.round(half.count * 0.5), `the range control sets density 0.5 (${half.drawn})`)
  expect(half.drawCalls <= 3, `one draw call plus two compute passes for the field (${half.drawCalls})`)
  ctx.ok(`field: density control and api set the drawn count; ${half.drawCalls} call(s) per frame incl. the two compute passes`)
  const sink = {}
  await experienceTail({ ...ctx, path: '/lab/field', name: 'field', metricsSink: sink })
  return { count: diag.count, side: diag.side, settle: { a: onA.mean, b: onB.mean }, pointer: { before: before.near, after: afterPush.near }, legibility: sink.legibility }
}

checks.story = async function story(ctx) {
  const { page, url } = ctx
  const d = await openLab(page, url, '/lab/story')
  expect(d.errors.length === 0, `console.error during mount: ${d.errors.slice(0, 3).join(' | ')}`)
  const t = d.transitions
  let diag = await api(page, { name: 'seek', args: [0.1] })
  const cp0 = await api(page, { name: 'checkpoint', args: [0, diag.local] })
  expect(diag.chapter.index === 0 && diag.transition.active === false, `0.1 is chapter 1 (${diag.chapter.id})`)
  expect(closeTo(diag.camera, cp0, 1e-3), `camera on the arrival path at local ${diag.local.toFixed(2)} ${fmt(cp0)} (got ${fmt(diag.camera)})`)
  diag = await api(page, { name: 'seek', args: [(t[0].from + t[0].to) / 2] })
  expect(diag.transition.active === true && diag.transition.mode === 'iris' && diag.transition.progress > 0.3 && diag.transition.progress < 0.7, `mid first boundary: iris transition in progress (${JSON.stringify(diag.transition)})`)
  diag = await api(page, { name: 'seek', args: [0.5] })
  expect(diag.chapter.index === 1 && diag.camera.space === 1 && diag.dissolve === 0, `0.5 is the hall with the floor intact (dissolve ${diag.dissolve})`)
  await api(page, { name: 'seek', args: [0.63] })
  await page.waitForTimeout(300)
  diag = await snapshot(page)
  expect(diag.dissolve > 0.3, `the hall floor dissolves late in chapter 2 (dissolve ${diag.dissolve.toFixed(2)})`)
  diag = await api(page, { name: 'seek', args: [(t[1].from + t[1].to) / 2] })
  expect(diag.transition.active === true && diag.transition.mode === 'dissolve', `second boundary: dissolve transition (${diag.transition.mode})`)
  diag = await api(page, { name: 'seek', args: [0.9] })
  const cp2 = await api(page, { name: 'checkpoint', args: [2, diag.local] })
  expect(diag.chapter.index === 2 && closeTo(diag.camera, cp2, 1e-3) && diag.cues.includes('caption:artefact'), `0.9 is the artefact chapter on its shot (${fmt(diag.camera)} vs ${fmt(cp2)}, cues ${diag.cues.join(',')})`)
  ctx.ok('story: three chapters, two transitions and the dissolving floor follow progress; cameras land on their checkpoints')
  const left = await api(page, { name: 'key', args: ['ArrowLeft'] })
  expect(left === d.chapters[1].start, `ArrowLeft asks to travel to chapter 2 (${left})`)
  expect((await api(page, { name: 'key', args: ['End'] })) === d.chapters[2].start, 'End asks for the last chapter')
  expect((await api(page, { name: 'key', args: ['Tab'] })) === null, 'Tab is not handled')
  await page.focus('[role="group"][aria-label^="Story"]')
  await page.keyboard.press('Home')
  await page.waitForTimeout(1200)
  const domState = () => page.evaluate(() => ({ hash: location.hash, current: document.querySelector('button[data-chapter][aria-current="step"]')?.getAttribute('data-chapter'), live: document.querySelector('[data-live]')?.textContent, progress: window.__lab.api.scrollProgress() }))
  let dom = await domState()
  expect(dom.current === 'arrival' && dom.hash === '#arrival', `Home moves to chapter 1 in the DOM (current ${dom.current}, hash ${dom.hash})`)
  await page.evaluate(() => { window.__chapterChanges = []; window.__lab.subscribeChanges?.((c) => window.__chapterChanges.push(`${c.previous}>${c.index}:${c.source}`)) })
  await page.click('button[data-chapter="artefact"]')
  await page.waitForTimeout(1500)
  dom = await domState()
  const changes = await page.evaluate(() => window.__chapterChanges)
  expect(changes.length === 1 && /:button$/.test(changes[0]), `one chapter change for the whole travel, no flicker through the hall (${changes.join(' ')})`)
  expect(dom.current === 'artefact' && dom.hash === '#artefact' && /Chapter 3 of 3/.test(dom.live ?? ''), `the chapter button travels to the artefact (current ${dom.current}, hash ${dom.hash}, live "${dom.live}")`)
  expect(dom.progress > 0.6, `the scroll followed the button (progress ${dom.progress.toFixed(2)})`)
  ctx.ok('story: keys and buttons change the chapter; aria-current, the live region and the hash follow')
  await page.setViewportSize({ width: 375, height: 667 })
  await page.waitForTimeout(600)
  const portrait = await snapshot(page)
  expect(portrait.fovScale === 1.3, `portrait viewport widens the field of view (scale ${portrait.fovScale})`)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(400)
  ctx.ok('story: portrait viewport raises the fov scale')
  const sink = {}
  await experienceTail({ ...ctx, path: '/lab/story', name: 'story', metricsSink: sink, reducedCheck: async (rp) => {
    await rp.click('button[data-chapter="artefact"]')
    await rp.waitForTimeout(300)
    const after = await snapshot(rp)
    expect(after.chapter.index === 2 && after.progress === 0.68, `reduced motion: the chapter button cuts straight to the artefact (chapter ${after.chapter.index}, progress ${after.progress})`)
  } })
  return { chapters: d.chapters, transitions: t, legibility: sink.legibility }
}

checks.assets = async function assets({ page, url, label, evidence, consoleProblems, ok }) {
  const manifest = await (await fetch(`${url}/models/manifest.json`)).json()
  const d = await openLab(page, url, '/lab/assets')
  expect(d.errors.length === 0, `console.error during the lab: ${d.errors.slice(0, 3).join(' | ')}`)
  expect(d.capabilities.draco && d.capabilities.ktx2 && d.capabilities.meshopt, `decoders attached (${JSON.stringify(d.capabilities)})`)
  const by = Object.fromEntries(d.variants.map((v) => [v.name, v]))
  for (const name of ['plain', 'draco', 'meshopt', 'ktx2', 'untextured']) {
    const v = by[name]
    expect(v && v.error === null, `${name} loads (${v?.error})`)
    expect(v.stats.meshes === 6 && v.stats.triangles === 1090 && v.stats.geometries === 6, `${name}: six parts, 1090 triangles (${JSON.stringify(v.stats)})`)
    expect(v.stats.textures === (name === 'untextured' ? 0 : 1), `${name}: texture count ${v.stats.textures}`)
    const file = v.url.split('/').pop()
    expect(v.bytes === manifest.files[file].bytes, `${name}: bytes match the manifest (${v.bytes} vs ${manifest.files[file].bytes})`)
    // textures: the base colour map, plus the morph-target texture three uploads for the grille's morph attribute
    expect(v.memoryDelta.geometries === 6 && v.memoryDelta.textures === (name === 'untextured' ? 1 : 2), `${name}: GPU memory delta after the first frame (${JSON.stringify(v.memoryDelta)}; expected 6 geometries and ${name === 'untextured' ? 1 : 2} textures incl. the morph-target texture)`)
    expect(v.afterRelease.geometries === 0 && v.afterRelease.textures === 0, `${name}: memory back after release (${JSON.stringify(v.afterRelease)})`)
    expect(v.fetchMs >= 0 && v.parseMs >= 0 && v.compileMs >= 0 && v.firstFrameMs >= 0, `${name}: stage timings recorded`)
  }
  expect(by.draco.bytes < by.plain.bytes * 0.4 && by.meshopt.bytes < by.plain.bytes * 0.8, `compressed variants are smaller (draco ${by.draco.bytes}, meshopt ${by.meshopt.bytes}, plain ${by.plain.bytes})`)
  ok(`assets: five variants load through their decoders; transfer/decode/upload/first-frame per variant: ${d.variants.map((v) => `${v.name} ${v.bytes}B fetch ${v.fetchMs.toFixed(0)} (network ${v.networkMs == null ? '?' : v.networkMs.toFixed(0)}) parse ${v.parseMs.toFixed(0)} compile ${v.compileMs.toFixed(0)} frame ${v.firstFrameMs.toFixed(0)} ms`).join('; ')}`)
  expect(d.failures.truncated === 'parse' && d.failures.missing === 'network' && d.failures['draco-no-decoder'] === 'decoder-missing' && d.failures['ktx2-no-decoder'] === 'decoder-missing' && d.failures['meshopt-no-decoder'] === 'decoder-missing', `failure kinds (${JSON.stringify(d.failures)})`)
  ok('assets: truncated → parse, 404 → network, Draco/KTX2/meshopt without decoders → decoder-missing')
  expect(d.sharing.sameAsset && d.sharing.geometriesWithTwo === 6 && d.sharing.geometriesWithOne === 6 && d.sharing.afterBoth === 0, `two handles share one master: ${JSON.stringify(d.sharing)}`)
  expect(d.late.rejected === 'aborted' && d.late.hasAfter === false && d.late.evicted.some((e) => e.startsWith('discarded')), `an aborted load rejects and its late result is discarded (${JSON.stringify(d.late)})`)
  ok('assets: sharing keeps one set of GPU resources; an abort leaves nothing behind')
  expect(d.clip.name === 'reveal' && d.clip.duration === 2 && near(d.clip.capYAtHalf - d.clip.capYAtStart, 0.5, 1e-3) && near(d.clip.grilleInfluenceAtHalf, 1, 1e-3) && d.clip.knobTurned, `the GLTF clip scrubs on an instance (${JSON.stringify(d.clip)})`)
  ok('assets: the file\'s animation clip drives the cap, the knob and the grille morph on an instance')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(evidence, `${label}-assets.png`) })
  const after = await leave(page, url, 'Second')
  expect(after.disposed === true, 'lab disposed on route change')
  expect(after.afterDispose.geometries === after.baseline.geometries && after.afterDispose.textures <= after.baseline.textures, `memory back to the renderer's baseline after dispose (${JSON.stringify(after.afterDispose)} vs baseline ${JSON.stringify(after.baseline)})`)
  ok('lifecycle: cache and runtime dispose to the baseline')
  // the lab asks for /models/nope.glb on purpose (the network error kind): that one 404 and its console line are expected
  const unexpected = consoleProblems.filter((p) => !/nope\.glb/.test(p) && !/status of 404/.test(p))
  const notFound = consoleProblems.filter((p) => /status of 404/.test(p))
  expect(unexpected.length === 0 && notFound.length <= 1, `console problems beyond the intentional 404: ${unexpected.concat(notFound.slice(1)).join(' | ')}`)
  return { variants: d.variants, failures: d.failures, sharing: d.sharing, late: d.late, clip: d.clip, manifest: manifest.files }
}

/** The declarative atelier (React Three Fiber on Next, TresJS on Nuxt): same assertions, the framework's own event path. */
async function declarativeAtelier(ctx, path, name) {
  const { page, browser, url, label, evidence, consoleProblems, ok } = ctx
  await page.goto(`${url}${path}`, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__lab) && window.__lab.ready === true, null, { timeout: 120000 })
  await page.waitForTimeout(500)
  let d = await snapshot(page)
  expect(d.loaded && d.parts.length === 6, `model loaded through the cache with the Draco decoder (${d.parts.join(',')})`)
  expect(d.info && d.info.geometries >= 6, `geometries uploaded (${d.info?.geometries})`)
  const assembled = d.positions
  // hover and click through the framework's own event path: the pointer goes to the projected cap
  const capAt = await api(page, { name: 'screenPositionOf', args: ['cap'] })
  expect(capAt && capAt.x > 0 && capAt.y > 0, `the cap projects on screen (${JSON.stringify(capAt)})`)
  await page.mouse.move(capAt.x, capAt.y)
  await page.waitForTimeout(250)
  await page.mouse.move(capAt.x + 1, capAt.y + 1)
  await page.waitForTimeout(250)
  d = await snapshot(page)
  expect(d.hovered === 'cap', `pointer over the cap hovers it through ${name} events (hovered ${d.hovered})`)
  await page.mouse.click(capAt.x + 1, capAt.y + 1)
  await page.waitForTimeout(300)
  d = await snapshot(page)
  const selectedLabel = await page.textContent('[data-selected]')
  expect(d.selected === 'cap' && /Top plate/.test(selectedLabel ?? ''), `a click selects the cap and the DOM label follows (${d.selected}, "${selectedLabel}")`)
  await page.mouse.move(5, 5)
  await page.waitForTimeout(250)
  ok(`${name}: hover and selection through the framework's pointer events; DOM label follows`)
  // exploded view: the DOM button drives it; parts move by the offsets and come back exactly
  await page.click('button[data-explode]')
  await page.waitForTimeout(1600)
  d = await snapshot(page)
  expect(d.exploded === true && d.explodeProgress === 1, `exploded (progress ${d.explodeProgress})`)
  expect(near(d.positions.cap.y - assembled.cap.y, 0.65, 1e-3) && near(d.positions.grille.x - assembled.grille.x, 0.55, 1e-3) && near(d.positions.grille.z - assembled.grille.z, 0.25, 1e-3) && near(d.positions.base.y - assembled.base.y, -0.45, 1e-3) && near(d.positions.body.y - assembled.body.y, 0, 1e-6), `parts moved by the documented offsets (cap +${(d.positions.cap.y - assembled.cap.y).toFixed(3)}, grille +${(d.positions.grille.z - assembled.grille.z).toFixed(3)}, base ${(d.positions.base.y - assembled.base.y).toFixed(3)})`)
  await page.click('button[data-explode]')
  await page.waitForTimeout(1600)
  d = await snapshot(page)
  for (const part of Object.keys(assembled)) expect(closeTo(d.positions[part], assembled[part], 1e-3), `${part} back to its assembled position`)
  expect(d.explodeProgress === 0, `timeline reversed to 0 (${d.explodeProgress})`)
  ok(`${name}: exploded view through GSAP moves the parts by their offsets and reassembles exactly`)
  expect(d.frames > 10, `frame loop running (${d.frames})`)
  await page.screenshot({ path: join(evidence, `${label}-${name}.png`) })
  const assembledText = await measureLegibility(page, 'assembled')
  const assembledGrade = gradeLegibility(assembledText, `${name} assembled`)
  await api(page, { name: 'explode', args: [true] })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: join(evidence, `${label}-${name}-exploded.png`) })
  const explodedText = await measureLegibility(page, 'exploded')
  const explodedGrade = gradeLegibility(explodedText, `${name} exploded`)
  const focus = await measureFocus(page)
  const badRings = focus.filter((f) => !f.passes)
  expect(badRings.length === 0, `${name}: focus indicator below 3:1 or missing: ${badRings.map((f) => `${f.tag} "${f.text}" (${f.indicator})`).join(', ')}`)
  ok(`${name}: legibility assembled ${assembledGrade.texts} texts (${assembledGrade.by.css} css / ${assembledGrade.by.bound} bound), exploded ${explodedGrade.texts}; focus rings ${focus.length}`)
  // lifecycle: route change disposes, re-entry recreates with equal counts
  const lifecycleBefore = await page.evaluate(() => JSON.parse(JSON.stringify(window.__labLifecycle)))
  const firstInfo = d.info
  const after = await leave(page, url, 'Second')
  expect(after.disposed === true && after.lifecycle.mounts === after.lifecycle.disposes, `route change disposes (mounts ${after.lifecycle.mounts}, disposes ${after.lifecycle.disposes})`)
  await page.goBack({ waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__lab) && window.__lab.ready === true && window.__lab.disposed === false, null, { timeout: 120000 })
  await page.waitForTimeout(600)
  const second = await snapshot(page)
  const lifecycleAfter = await page.evaluate(() => JSON.parse(JSON.stringify(window.__labLifecycle)))
  expect(lifecycleAfter.mounts > lifecycleBefore.mounts && second.loaded && second.parts.length === 6, 're-entry recreates the experience')
  expect(second.info.geometries === firstInfo.geometries && Math.abs(second.info.textures - firstInfo.textures) <= 1, `re-entry has equal resource counts (${second.info.geometries}g/${second.info.textures}t vs ${firstInfo.geometries}g/${firstInfo.textures}t)`)
  ok(`${name}: route change disposes and re-entry recreates with equal counts (${second.info.geometries} geometries, ${second.info.textures} textures)`)
  await leave(page, url, 'Second')
  expect(consoleProblems.length === 0, `console problems: ${consoleProblems.join(' | ')}`)
  // reduced motion: the exploded view is a cut and the turntable stands still
  const reduced = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  const rp = await reduced.newPage()
  await rp.goto(`${url}${path}`, { waitUntil: 'load' })
  await rp.waitForFunction(() => Boolean(window.__lab) && window.__lab.ready === true, null, { timeout: 120000 })
  await rp.waitForTimeout(400)
  const r0 = await snapshot(rp)
  expect(r0.reducedMotion === true, 'reduced motion branch taken')
  await rp.click('button[data-explode]')
  await rp.waitForTimeout(150)
  const r1 = await snapshot(rp)
  expect(r1.explodeProgress === 1, `reduced motion: the exploded view is a cut (progress ${r1.explodeProgress} after 150 ms)`)
  ok(`${name}: reduced motion cuts to the exploded view instead of animating`)
  await reduced.close()
  return { assembled, exploded: d.positions, info: firstInfo, legibility: { states: [assembledText, explodedText], summaries: [{ state: 'assembled', ...assembledGrade }, { state: 'exploded', ...explodedGrade }], focus } }
}
checks.r3f = (ctx) => declarativeAtelier(ctx, '/lab/atelier-r3f', 'r3f')
checks.tres = (ctx) => declarativeAtelier(ctx, '/lab/atelier-tres', 'tres')

/**
 * Hardware measurements (1.5 increment 4): meant for a browser with a real GPU (`--channel chromium` launches the full
 * Chromium, which on this machine renders through ANGLE Metal and exposes WebGPU). Records the adapter, the TSL lab on
 * the real WebGPU backend when available, the particle comparison and the frame rate of the three experiences; asserts
 * only what must hold (no errors; WebGPU used when the browser has it). On SwiftShader it still runs and says so.
 */
checks.gpu = async function gpu({ page, url, label, evidence, consoleProblems, ok }) {
  const report = { renderer: null, webgpu: null, tsl: null, particles: null, experiences: {} }
  await page.goto(`${url}/lab/shaders?backend=webgpu`, { waitUntil: 'load' })
  report.webgpu = await page.evaluate(async () => {
    if (!('gpu' in navigator)) return { available: false }
    try {
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) return { available: true, adapter: null }
      return { available: true, adapter: { vendor: adapter.info?.vendor ?? null, architecture: adapter.info?.architecture ?? null, device: adapter.info?.device ?? null, description: adapter.info?.description ?? null, features: adapter.features.size, maxTextureDimension2D: adapter.limits.maxTextureDimension2D }, preferredFormat: navigator.gpu.getPreferredCanvasFormat() }
    } catch (error) { return { available: true, error: String(error.message).slice(0, 120) } }
  })
  await page.waitForFunction(() => Boolean(window.__lab) && window.__lab.ready === true, null, { timeout: 240000 })
  const shaders = await readLab(page)
  report.renderer = shaders.renderer
  report.tsl = { backend: shaders.tsl.backend, error: shaders.tsl.error, materials: shaders.tsl.materials, programs: shaders.programs }
  const software = /swiftshader|llvmpipe|software/i.test(shaders.renderer)
  expect(shaders.errors.length === 0, `console.error in the shader lab: ${shaders.errors.slice(0, 3).join(' | ')}`)
  if (report.webgpu.available && report.webgpu.adapter) {
    expect(shaders.tsl.backend === 'webgpu' && shaders.tsl.error === null, `WebGPU is available (${JSON.stringify(report.webgpu.adapter)}) so the node materials must run on the real backend (${shaders.tsl.backend}, ${shaders.tsl.error})`)
    expect(shaders.tsl.materials.length === 3 && shaders.tsl.materials.every((m) => m.coverage > 0.2), `three TSL materials render on WebGPU (${JSON.stringify(shaders.tsl.materials)})`)
    ok(`gpu: ${shaders.renderer.slice(0, 60)} | WebGPU ${report.webgpu.adapter.vendor}/${report.webgpu.adapter.architecture}: TSL materials compiled and rendered on the real backend`)
  } else {
    ok(`gpu: ${shaders.renderer.slice(0, 60)} | no WebGPU adapter in this browser; TSL ran on the ${shaders.tsl.backend} backend`)
  }
  await leave(page, url, 'Second')
  // particle comparison on this GPU
  await page.goto(`${url}/lab/particles`, { waitUntil: 'load' })
  await page.waitForFunction(() => Boolean(window.__lab) && window.__lab.ready === true, null, { timeout: 240000 })
  const particles = await readLab(page)
  report.particles = { renderer: particles.renderer, bench: particles.bench, adaptive: particles.adaptive, contextLoss: particles.contextLoss }
  ok(`gpu: particles ${particles.bench.map((r) => `${r.mode}@${r.count}: js ${r.jsMs.toFixed(2)} ms, frame p50 ${r.frameMs.p50.toFixed(1)} ms`).join('; ')}`)
  await leave(page, url, 'Second')
  // experiences on this backend: steady-state frame, CPU and (with timer queries) GPU time percentiles at a mid
  // progress, draw calls, triangles and resident resources; the peak during a progress sweep (chapter transitions,
  // dissolves, particle hand-overs); the counts and frame time after three leave/re-enter cycles. Every record names
  // its backend: software and hardware numbers are never read side by side. 60 fps at vsync says a frame fits in
  // 16.7 ms, not how much is left: the CPU and GPU times are the margin
  const backend = software ? 'software' : 'hardware'
  // what this browser paces a blank WebGL page at: the experiences' frame intervals are read against it, not as load
  await page.goto('about:blank')
  const pacing = await page.evaluate(() => new Promise((resolve) => {
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 360
    document.body.appendChild(c)
    const gl = c.getContext('webgl2')
    const ts = []
    const tick = (t) => {
      if (gl) { gl.clearColor(0.1, 0.1, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT) }
      ts.push(t)
      if (ts.length < 90) requestAnimationFrame(tick)
      else { const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); resolve({ p50: Number(d[Math.floor(d.length / 2)].toFixed(1)), min: Number(d[0].toFixed(1)), max: Number(d[d.length - 1].toFixed(1)) }) }
    }
    requestAnimationFrame(tick)
  }))
  report.pacing = { blankWebGLPage: pacing }
  ok(`gpu (${backend}): this browser paces a blank WebGL page at ${pacing.p50} ms per frame (min ${pacing.min}, max ${pacing.max}); the frame intervals below are read against that, the CPU and GPU times are the margin`)
  for (const [name, path, mid] of [['product', '/lab/product', 0.5], ['field', '/lab/field', 0.5], ['story', '/lab/story', 0.5], ['atelier', '/lab/atelier', 0.12]]) {
    await openLab(page, url, path)
    await api(page, { name: 'seek', args: [mid] })
    await page.waitForTimeout(500)
    // clean window: frame interval and CPU time with no query in the command stream (the software renderer draws the
    // product at a few frames per second: a longer window, fewer samples required)
    await api(page, { name: 'resetTiming', args: [false] })
    await page.waitForTimeout(software ? 8000 : 4000)
    const steady = await snapshot(page)
    const t = steady.stats.timing
    expect(t && t.frame.samples >= (software ? 10 : 30), `${name}: the frame timing window has samples (${t?.frame?.samples})`)
    // GPU window: timer queries on (they add pipeline latency, so the frame interval of this window is reported apart)
    let gpuWindow = null
    if (!software) {
      await api(page, { name: 'resetTiming', args: [true] })
      await page.waitForTimeout(3000)
      gpuWindow = (await snapshot(page)).stats.timing
      expect(gpuWindow.gpu && gpuWindow.gpu.samples > 0, `${name}: GPU timer queries deliver samples on the hardware backend (${gpuWindow.gpuTimer})`)
    }
    await api(page, { name: 'resetTiming', args: [!software] })
    for (let i = 0; i <= 20; i++) {
      await api(page, { name: 'seek', args: [i / 20] })
      await page.waitForTimeout(120)
    }
    const sweep = (await snapshot(page)).stats.timing
    const lifecycleBefore = await page.evaluate(() => JSON.parse(JSON.stringify(window.__labLifecycle)))
    for (let i = 0; i < 3; i++) {
      await leave(page, url, 'Second')
      await page.goBack({ waitUntil: 'load' })
      await page.waitForFunction(() => Boolean(window.__lab) && window.__lab.ready === true && window.__lab.disposed === false, null, { timeout: 240000 })
    }
    await api(page, { name: 'seek', args: [mid] })
    await page.waitForTimeout(500)
    await api(page, { name: 'resetTiming', args: [false] })
    await page.waitForTimeout(2500)
    const again = await snapshot(page)
    const lifecycleAfter = await page.evaluate(() => JSON.parse(JSON.stringify(window.__labLifecycle)))
    expect(lifecycleAfter.mounts === lifecycleBefore.mounts + 3 && lifecycleAfter.disposes === lifecycleBefore.disposes + 3, `${name}: three leave/re-enter cycles balance (${lifecycleAfter.mounts}/${lifecycleAfter.disposes})`)
    expect(again.stats.info.geometries === steady.stats.info.geometries && Math.abs(again.stats.info.textures - steady.stats.info.textures) <= 2 && again.stats.info.programs <= steady.stats.info.programs + 1, `${name}: resident resources after three re-entries match the first visit (${again.stats.info.geometries}g/${again.stats.info.textures}t/${again.stats.info.programs}p vs ${steady.stats.info.geometries}g/${steady.stats.info.textures}t/${steady.stats.info.programs}p)`)
    report.experiences[name] = {
      backend,
      renderer: shaders.renderer,
      steady: { frame: t.frame, cpu: t.cpu, gpu: gpuWindow ? gpuWindow.gpu : null, gpuTimer: gpuWindow ? gpuWindow.gpuTimer : null, frameWithQueries: gpuWindow ? gpuWindow.frame : null, calls: steady.stats.info.calls, triangles: steady.stats.info.triangles, geometries: steady.stats.info.geometries, textures: steady.stats.info.textures, programs: steady.stats.info.programs, pixelRatio: steady.stats.pixelRatio, size: steady.stats.size },
      sweep: { frame: sweep.frame, cpu: sweep.cpu, gpu: sweep.gpu },
      afterNavigation: { cycles: 3, frame: again.stats.timing.frame, cpu: again.stats.timing.cpu, gpu: again.stats.timing.gpu, geometries: again.stats.info.geometries, textures: again.stats.info.textures, programs: again.stats.info.programs },
      // the increment-4 shape, kept
      fps: t.frame.p50 > 0 ? Number((1000 / t.frame.p50).toFixed(1)) : null,
      msPerFrame: t.frame.p50,
      calls: steady.stats.info.calls,
      triangles: steady.stats.info.triangles,
      pixelRatio: steady.stats.pixelRatio,
      size: steady.stats.size,
    }
    const ms = (x) => (x && x.samples ? `${x.p50}/${x.p95}/${x.p99}` : 'n/a')
    ok(`gpu (${backend}): ${name} frame p50/p95/p99 ${ms(t.frame)} ms, cpu ${ms(t.cpu)} ms, gpu ${gpuWindow ? `${ms(gpuWindow.gpu)} ms (${gpuWindow.gpuTimer}; frame p50 ${gpuWindow.frame.p50} ms while queries were on)` : 'n/a (no timer query on this backend)'}, ${steady.stats.info.calls} calls, ${steady.stats.info.triangles} tris, ${steady.stats.info.geometries}g/${steady.stats.info.textures}t/${steady.stats.info.programs}p at ${steady.stats.size.width}×${steady.stats.size.height}@${steady.stats.pixelRatio}; sweep p99 frame ${sweep.frame.p99} ms${sweep.gpu && sweep.gpu.samples ? `, gpu ${sweep.gpu.p99} ms` : ''}; after 3 re-entries frame p50 ${again.stats.timing.frame.p50} ms, same residents`)
    await leave(page, url, 'Second')
  }
  report.software = software
  writeFileSync(join(evidence, `${label}-gpu-report.json`), JSON.stringify(report, null, 2))
  expect(consoleProblems.length === 0, `console problems: ${consoleProblems.join(' | ')}`)
  return report
}

checks.atelier = async function atelier(ctx) {
  const { page, url } = ctx
  const d = await openLab(page, url, '/lab/atelier')
  expect(d.errors.length === 0, `console.error during mount: ${d.errors.slice(0, 3).join(' | ')}`)
  let diag = await snapshot(page)
  expect(diag.loaded && diag.model && /atelier\.draco\.glb$/.test(diag.model.url) && diag.model.parts.length === 6 && diag.model.triangles === 1090, `the Draco model arrived through the cache (${JSON.stringify(diag.model)})`)
  ctx.ok(`atelier: ${diag.model.url.split('/').pop()} (${diag.model.bytes} B, fetch ${diag.model.fetchMs.toFixed(0)} ms, parse ${diag.model.parseMs.toFixed(0)} ms) with six parts`)
  diag = await api(page, { name: 'seek', args: [0.1] })
  const assembled = diag.positions
  expect(diag.chapter.id === 'hero' && diag.cues.includes('caption:hero') && diag.explode === 0 && diag.dissolve === 0, `0.1 is the hero chapter (${diag.chapter.id}, cues ${diag.cues.join(',')})`)
  diag = await api(page, { name: 'seek', args: [0.5] })
  expect(diag.chapter.id === 'exploded' && diag.explode === 1, `0.5 is the exploded view at full progress (${diag.explode})`)
  expect(near(diag.positions.cap.y - assembled.cap.y, 0.65, 1e-3) && near(diag.positions.grille.x - assembled.grille.x, 0.55, 1e-3) && near(diag.positions.grille.z - assembled.grille.z, 0.25, 1e-3) && near(diag.positions.base.y - assembled.base.y, -0.45, 1e-3), `parts displaced by the documented offsets (cap +${(diag.positions.cap.y - assembled.cap.y).toFixed(3)}, grille +${(diag.positions.grille.z - assembled.grille.z).toFixed(3)}, base ${(diag.positions.base.y - assembled.base.y).toFixed(3)})`)
  ctx.ok('atelier: the exploded view scrubs with the chapter and lands on the documented offsets')
  diag = await api(page, { name: 'seek', args: [0.65] }) // local 0.5 of the dust chapter: fully gathered, not yet released
  expect(diag.chapter.id === 'dust' && diag.dissolve > 0.9 && diag.particles.morph > 0.9, `mid dust chapter: parts dissolved (${diag.dissolve.toFixed(2)}), particles gathering (morph ${diag.particles.morph.toFixed(2)})`)
  await api(page, { name: 'advance', args: [4] })
  const distance = await api(page, { name: 'surfaceDistance', args: [] })
  expect(distance < 0.35, `particles sit on the product's surface sampled from the model (mean distance ${distance.toFixed(3)} after 4 s of simulation)`)
  await settledCaption(page)
  await page.screenshot({ path: join(ctx.evidence, `${ctx.label}-atelier-dust.png`) })
  diag = await api(page, { name: 'seek', args: [0.79] }) // just past the dust chapter: released and reassembled
  expect(diag.dissolve < 0.01 && diag.explode < 0.01, `after the dust chapter: parts solid and assembled again (dissolve ${diag.dissolve.toFixed(3)}, explode ${diag.explode.toFixed(3)})`)
  ctx.ok(`atelier: dissolve shader and GPGPU reconstruction follow the chapter (surface distance ${distance.toFixed(3)}) and give the product back`)
  diag = await api(page, { name: 'seek', args: [0.95] })
  expect(diag.chapter.id === 'choose' && diag.cues.includes('caption:choose'), `0.95 is the choose chapter`)
  await page.selectOption('select[data-option="finish"]', 'oxblood')
  diag = await settled(page, (d) => d.paintColor)
  const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  const sameColour = (a, b) => [0, 1, 2].every((i) => Math.abs(channel(a, i) - channel(b, i)) <= 2)
  expect(diag.selection.finish === 'oxblood' && sameColour(diag.paintColor, '#5a1620'), `the finish select recolours the body (${diag.paintColor})`)
  expect((await api(page, { name: 'set', args: ['grille', 'steel'] })) === true, 'grille option set through the api')
  const capAt = await api(page, { name: 'screenPositionOf', args: ['cap'] })
  await page.mouse.move(capAt.x, capAt.y)
  await page.waitForTimeout(250)
  await page.mouse.move(capAt.x + 1, capAt.y + 1)
  await page.waitForTimeout(250)
  diag = await snapshot(page)
  expect(diag.hovered === 'cap', `pointer over the projected cap hovers it through the ray picker (${diag.hovered})`)
  await page.mouse.click(capAt.x + 1, capAt.y + 1)
  await page.waitForTimeout(250)
  const label = await page.textContent('[data-selected]')
  diag = await snapshot(page)
  expect(diag.selected === 'cap' && /Top plate/.test(label ?? ''), `click selects the cap and the DOM names it (${diag.selected}, "${label}")`)
  await page.mouse.move(5, 5)
  ctx.ok('atelier: configurator, hover and selection work on the imported parts')
  const explore = await api(page, { name: 'explore', args: [] })
  expect(explore.exploring === true && explore.owners['camera.position'] === 'orbit-controls' && (await api(page, { name: 'scrubPaused', args: [] })) === true, 'explore mode takes the camera and pauses the scrub')
  const resumed = await api(page, { name: 'resume', args: [] })
  expect(resumed.exploring === false && resumed.owners['camera.position'] === 'camera-rig', 'resume gives the camera back')
  await page.evaluate(() => { window.__chapterChanges = []; window.__lab.subscribeChanges((c) => window.__chapterChanges.push(`${c.previous}>${c.index}:${c.source}`)) })
  await page.click('button[data-chapter="exploded"]')
  await page.waitForTimeout(1500)
  const dom = await page.evaluate(() => ({ current: document.querySelector('button[data-chapter][aria-current="step"]')?.getAttribute('data-chapter'), changes: window.__chapterChanges, progress: window.__lab.api.scrollProgress() }))
  expect(dom.current === 'exploded' && dom.changes.length === 1, `the chapter button travels with one announced change (${dom.changes.join(' ')})`)
  await page.setViewportSize({ width: 375, height: 667 })
  await page.waitForTimeout(600)
  expect((await snapshot(page)).fovScale === 1.3, 'portrait viewport widens the field of view')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(400)
  ctx.ok('atelier: explore hand-over, chapter buttons without flicker, portrait fov')
  const sink = {}
  await experienceTail({ ...ctx, path: '/lab/atelier', name: 'atelier', allowedTextures: 1, metricsSink: sink })
  return { model: diag.model, distance, legibility: sink.legibility }
}


/**
 * Accessibility of the experience pages beyond the pointer (1.5 increment 4B): no WebGL → a named state and the DOM
 * alternative, no control left that drives nothing; a failed model → a named error and balanced counters; every
 * control in <main> reachable by Tab in DOM order with an accessible name; a pointer-free path to part selection;
 * no control covered by the canvas; reflow at 320 px and text at 200% without horizontal overflow. Runs on every
 * experience page the app serves.
 */
checks.a11y = async function a11y({ page, browser, url, label, consoleProblems, ok }) {
  const declarative = label === 'next' ? '/lab/atelier-r3f' : '/lab/atelier-tres'
  const pages = ['/lab/product', '/lab/field', '/lab/story', '/lab/atelier', declarative]
  const report = {}
  const statusSettled = (p) => p.waitForFunction(() => { const s = document.querySelector('[data-status]'); return Boolean(s) && s.textContent !== 'loading' }, null, { timeout: 120000 })
  let phase = 'start'
  const within = (label, fn) => fn().catch((error) => { throw new Error(`${phase} ${label}: ${error.message}`) })
  const pageState = (p) => p.evaluate(() => {
    const visible = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0 }
    return {
      status: document.querySelector('[data-status]')?.textContent ?? null,
      problem: document.querySelector('[data-problem]')?.textContent ?? null,
      alert: document.querySelector('[data-problem]')?.getAttribute('role') ?? null,
      entries: [...document.querySelectorAll('[data-caption], .caption, [data-fallback] li')].filter(visible).length,
      canvasVisible: [...document.querySelectorAll('canvas')].some(visible),
      controls: [...document.querySelectorAll('main button, main select, main input, main a')].filter(visible).length,
      lifecycle: window.__labLifecycle ? { ...window.__labLifecycle } : null,
    }
  })
  // 1. no WebGL: an init script makes every WebGL context request fail, as a browser without it would
  phase = 'no-webgl'
  for (const path of pages) await within(path, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await ctx.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(String(type)) ? null : original.call(this, type, ...rest) }
    })
    const p = await ctx.newPage()
    const errors = []
    p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)))
    await p.goto(`${url}${path}`, { waitUntil: 'load' })
    await statusSettled(p)
    await p.waitForTimeout(300)
    const state = await pageState(p)
    expect(state.status === 'unsupported', `${path}: without WebGL the page names the state (status "${state.status}", problem "${state.problem}")`)
    expect(state.alert === 'alert' && /cannot show the 3D scene/.test(state.problem ?? ''), `${path}: the alternative is announced through role=alert ("${state.problem}")`)
    expect(state.entries > 0, `${path}: the content is readable in the DOM without the scene (${state.entries} entries visible)`)
    expect(!state.canvasVisible && state.controls === 0, `${path}: nothing is left that would drive a scene that is not there (canvas visible ${state.canvasVisible}, controls ${state.controls})`)
    expect(errors.length === 0, `${path}: no uncaught error without WebGL (${errors.slice(0, 2).join(' | ')})`)
    const fallbackText = gradeLegibility(await measureLegibility(p, 'no-webgl'), `${path} without WebGL`)
    report[path] = { noWebGL: { status: state.status, entries: state.entries, legibility: fallbackText } }
    await ctx.close()
  })
  ok(`a11y: without WebGL every page says so (role=alert), lists its content in the DOM and hides the scene's controls (${pages.length} pages)`)
  // 2. a failed model: the atelier pages name the error; the imperative page leaves balanced counters behind
  phase = 'failed-load'
  for (const path of ['/lab/atelier', declarative]) await within(path, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const p = await ctx.newPage()
    await p.route('**/models/*.glb', (route) => route.abort('failed'))
    const errors = []
    p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)))
    await p.goto(`${url}${path}`, { waitUntil: 'load' })
    // the declarative page publishes its api before the model arrives (status "ready"), and React surfaces the
    // rejected load through Suspense and the boundary about a second later: wait for the announcement itself
    await p.waitForFunction(() => Boolean(document.querySelector('[data-problem]')) || (window.__lab && window.__lab.ready === true), null, { timeout: 20000 }).catch(() => {})
    await p.waitForTimeout(300)
    const state = await pageState(p)
    expect(state.status === 'error', `${path}: a failed model load ends in a named error state (status "${state.status}", problem "${state.problem}")`)
    expect(state.alert === 'alert' && /could not be loaded/.test(state.problem ?? ''), `${path}: the error is announced through role=alert ("${state.problem}")`)
    if (path === '/lab/atelier') expect(state.lifecycle && state.lifecycle.mounts === state.lifecycle.disposes, `${path}: the failed mount disposed what it had created (${JSON.stringify(state.lifecycle)})`)
    // React 19 also reports a boundary-caught error through the window's error event (reportError); the model's own
    // error is the only one allowed there, anything else is a failure the page did not handle
    const foreign = errors.filter((e) => !/atelier[^ ]*\.glb|Failed to fetch/.test(e))
    expect(foreign.length === 0, `${path}: nothing but the model's own error reached the window (${foreign.slice(0, 2).join(' | ')})`)
    report[path].failedLoad = { status: state.status, problem: state.problem, lifecycle: state.lifecycle, windowErrors: errors.slice(0, 3) }
    await ctx.close()
  })
  ok('a11y: a failed model load ends in a named, announced error on both atelier pages; the imperative one leaves balanced counters')
  // 3. keyboard: reach, order and names of every control; the pointer-free part selection; nothing covered by the canvas
  phase = 'keyboard'
  const stageIntoView = (p) => p.evaluate(() => { const stage = document.querySelector('main canvas') ?? document.querySelector('main'); stage?.scrollIntoView({ block: 'start' }) })
  for (const path of pages) await within(path, async () => {
    await openLab(page, url, path)
    await stageIntoView(page)
    await page.waitForTimeout(300)
    const controls = await page.evaluate(() => {
      const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' }
      const items = [...document.querySelectorAll('main button, main select, main input, main a, main [tabindex="0"]')].filter(visible)
      items.forEach((e, i) => e.setAttribute('data-fa-i', String(i)))
      return items.map((e, i) => {
        // a <label> that wraps the control names it by its own text, not by the options inside the control
        const label = e.labels && e.labels[0] ? [...e.labels[0].childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ') : ''
        const name = (e.getAttribute('aria-label') || label || e.textContent || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim()
        const r = e.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return { i, tag: e.tagName.toLowerCase(), name, container: e.getAttribute('role') === 'group', covered: !(hit === e || e.contains(hit)) }
      })
    })
    const sequence = []
    for (let k = 0; k < 60; k++) {
      await page.keyboard.press('Tab')
      const i = await page.evaluate(() => { const el = document.activeElement; const v = el?.getAttribute('data-fa-i'); return v === null || v === undefined ? null : Number(v) })
      if (i !== null) { if (sequence.includes(i)) break; sequence.push(i) }
      if (sequence.length === controls.length) break
    }
    const unreached = controls.filter((c) => !sequence.includes(c.i))
    expect(unreached.length === 0, `${path}: every control in <main> is reachable with Tab (missing ${unreached.map((c) => `${c.tag} "${c.name}"`).join(', ')})`)
    const inOrder = sequence.every((v, k) => k === 0 || v > sequence[k - 1])
    expect(inOrder, `${path}: the Tab order follows the DOM order (${sequence.join(' ')})`)
    const unnamed = controls.filter((c) => !c.name)
    expect(unnamed.length === 0, `${path}: every control has an accessible name (${unnamed.map((c) => c.tag).join(', ')})`)
    const covered = controls.filter((c) => !c.container && c.covered)
    expect(covered.length === 0, `${path}: no control is covered by the canvas or another layer (${covered.map((c) => `${c.tag} "${c.name}"`).join(', ')})`)
    let partSelection = null
    if (/atelier/.test(path)) {
      await page.selectOption('select[data-part]', 'cap')
      await page.waitForTimeout(200)
      const chosen = await page.evaluate(() => ({ selected: window.__lab.diagnostics().selected, label: document.querySelector('[data-selected]')?.textContent ?? '' }))
      expect(chosen.selected === 'cap' && /Top plate/.test(chosen.label), `${path}: the part select selects without a pointer (${JSON.stringify(chosen)})`)
      await page.selectOption('select[data-part]', '')
      await page.waitForTimeout(200)
      const cleared = await page.evaluate(() => window.__lab.diagnostics().selected)
      expect(cleared === null, `${path}: "None" clears the selection (${cleared})`)
      partSelection = { chosen, cleared }
    }
    report[path].keyboard = { controls: controls.length, sequence, partSelection }
    await leave(page, url, 'Second')
  })
  ok(`a11y: every control reachable by Tab in DOM order with a name, none covered by the canvas, part selection works from the keyboard on the atelier pages`)
  // 4. reflow at 320 px and text at 200%: no horizontal overflow, controls and captions inside the viewport
  phase = 'reflow'
  for (const path of pages) await within(path, async () => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 568 } })
    const p = await ctx.newPage()
    await p.goto(`${url}${path}`, { waitUntil: 'load' })
    await statusSettled(p)
    await stageIntoView(p)
    await p.waitForTimeout(400)
    const narrow = await p.evaluate(() => {
      const de = document.documentElement
      const outside = [...document.querySelectorAll('main button, main select, main input, [data-caption][data-active="true"], .caption')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) }).map((e) => e.tagName.toLowerCase() + ' ' + (e.textContent || '').trim().slice(0, 16))
      return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, outside }
    })
    expect(narrow.scrollWidth <= narrow.clientWidth + 1, `${path}: no horizontal overflow at 320 px (${narrow.scrollWidth} > ${narrow.clientWidth})`)
    expect(narrow.outside.length === 0, `${path}: controls and captions stay inside a 320 px viewport (${narrow.outside.join(', ')})`)
    await ctx.close()
    await openLab(page, url, path)
    await stageIntoView(page)
    const zoomed = await page.evaluate(async () => {
      document.documentElement.style.fontSize = '200%'
      await new Promise((r) => setTimeout(r, 400))
      const de = document.documentElement
      const captions = [...document.querySelectorAll('[data-caption][data-active="true"], .caption')].map((e) => { const r = e.getBoundingClientRect(); return { inside: r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.left >= -1, clipped: e.scrollHeight > e.clientHeight + 2 } })
      const out = { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, captions }
      document.documentElement.style.fontSize = ''
      return out
    })
    expect(zoomed.scrollWidth <= zoomed.clientWidth + 1, `${path}: no horizontal overflow at 200% text (${zoomed.scrollWidth} > ${zoomed.clientWidth})`)
    expect(zoomed.captions.every((c) => c.inside && !c.clipped), `${path}: captions stay inside the viewport and unclipped at 200% text (${JSON.stringify(zoomed.captions)})`)
    report[path].reflow = { narrow, zoomed }
    await leave(page, url, 'Second')
  })
  ok('a11y: no horizontal overflow at 320 px or at 200% text; controls and captions stay inside the viewport')
  expect(consoleProblems.length === 0, `console problems: ${consoleProblems.join(' | ')}`)
  return report
}

export async function runLabChecks(chromium, { url, label, pages, evidence, channel }) {
  mkdirSync(evidence, { recursive: true })
  // the default headless shell renders with SwiftShader; `channel: 'chromium'` launches the full Chromium in new
  // headless mode, which uses the machine's GPU (ANGLE Metal here) and exposes WebGPU
  const browser = await chromium.launch(channel ? { headless: true, channel } : { headless: true })
  const results = []
  const metrics = {}
  const ok = (name) => results.push(name)
  try {
    for (const name of pages) {
      const check = checks[name]
      if (!check) throw new Error(`unknown lab page "${name}" (have ${Object.keys(checks).join(', ')})`)
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' })
      const page = await context.newPage()
      const consoleProblems = []
      page.on('console', (m) => { if (m.type() === 'error') consoleProblems.push(`${m.type()}: ${m.text().slice(0, 200)}`) })
      page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${String(e.message).slice(0, 200)}`))
      page.on('response', (r) => { if (r.status() >= 400) consoleProblems.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`) })
      try {
        metrics[name] = await check({ page, browser, url, label, evidence, consoleProblems, ok })
      } catch (error) {
        metrics[name] = { failed: error.message, lab: await readLab(page).catch(() => null) }
        throw error
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
    // what was measured is kept even when an assertion failed
    writeFileSync(join(evidence, `${label}-metrics.json`), JSON.stringify(metrics, null, 2))
  }
  console.log(`check-lab (${label}): ${results.length} checks passed\n  - ${results.join('\n  - ')}\n  evidence: ${evidence}`)
  return metrics
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2)
  const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
  const url = opt('url')
  const label = opt('label') ?? 'app'
  const pages = (opt('pages') ?? Object.keys(checks).join(',')).split(',').filter(Boolean)
  const evidence = opt('evidence') ?? join(here, 'evidence')
  const channel = opt('channel')
  if (!url) {
    console.error('lab-checks: missing --url')
    process.exit(2)
  }
  const { chromium } = createRequire(import.meta.url)('playwright')
  try {
    await runLabChecks(chromium, { url, label, pages, evidence, channel })
  } catch (error) {
    console.error(`check-lab (${label}): ${error.message}`)
    process.exit(1)
  }
}
