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
  for (const r of rows) expect(r.drawCalls <= 2, `${r.mode}@${r.count} draws in one call (${r.drawCalls})`)
  ok(`comparison: CPU ${cpuSmall.jsMs.toFixed(2)}→${cpuLarge.jsMs.toFixed(2)} ms JS/frame from 4k to 65k; GPGPU ${gpuSmall.jsMs.toFixed(2)}→${gpuLarge.jsMs.toFixed(2)}; instanced ${by('instanced', 4096).jsMs.toFixed(2)}→${instLarge.jsMs.toFixed(2)}; one draw call each (software renderer: ${d.renderer.slice(0, 40)})`)
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

const api = (page, call) => page.evaluate((c) => {
  const lab = window.__lab
  const fn = lab.api[c.name]
  const result = fn(...c.args)
  return JSON.parse(JSON.stringify(result ?? null))
}, call)
const closeTo = (p, q, tolerance) => Math.abs(p.x - q.x) <= tolerance && Math.abs(p.y - q.y) <= tolerance && Math.abs(p.z - q.z) <= tolerance
const fmt = (p) => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`
const snapshot = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__lab.diagnostics())))

/** Shared tail: scroll binding, screenshots, disposal, re-entry and reduced motion for an experience page. */
async function experienceTail({ page, browser, url, label, path, evidence, consoleProblems, ok, name, reducedCheck, allowedTextures = 1 }) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5))
  await page.waitForTimeout(900)
  const scrolled = await api(page, { name: 'scrollProgress', args: [] })
  expect(scrolled > 0.2 && scrolled < 0.8, `scroll drives the progress through the scrub (${scrolled.toFixed(2)} at half the page)`)
  ok(`${name}: scroll scrubs the progress (${scrolled.toFixed(2)} at mid-page)`)
  for (const p of [0, 0.5, 1]) {
    await api(page, { name: 'seek', args: [p] })
    // a simulation gets three seconds of fixed steps so the evidence shows a settled state, not the first frame after the seek
    await page.evaluate(() => (window.__lab.api.advance ? window.__lab.api.advance(3) : null))
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(evidence, `${label}-${name}-${p}.png`) })
  }
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
  ctx.ok('product: camera lands on the four documented shots; captions, focus and key light follow the cues')
  const captionsActive = await page.evaluate(() => [...document.querySelectorAll('[data-caption][data-active="true"]')].map((e) => e.getAttribute('data-caption')))
  expect(captionsActive.length === 1 && captionsActive[0] === 'establishing', `one DOM caption active at 0 (${captionsActive.join(',')})`)
  await page.selectOption('select[data-option="color"]', 'rose')
  await page.waitForTimeout(1100)
  let diag = await snapshot(page)
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
  const resumed = await api(page, { name: 'seek', args: [0.2] })
  expect(resumed.exploring === false && resumed.owners['camera.position'] === 'camera-rig', `seeking resumes the rig (${JSON.stringify(resumed.owners)})`)
  ctx.ok('product: explore mode hands the camera to the controls and a seek hands it back')
  expect(diag.stats.info.calls <= 40, `draw calls within budget (${diag.stats.info.calls})`)
  expect(d.tier.pinned === 'medium', `tier pinned for the lab (${d.tier.pinned}, heuristic would pick ${d.tier.detected})`)
  // allowed after dispose: the renderer's placeholder sampler and the transmission render target three keeps in its
  // render state (renderer.dispose() drops the state without disposing it; the context release frees the GPU memory)
  await experienceTail({ ...ctx, path: '/lab/product', name: 'product', allowedTextures: 2 })
  return { shots, tier: d.tier, drawCalls: diag.stats.info.calls, stats: diag.stats.info }
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
  expect(half.drawCalls <= 2, `one draw call for the field (${half.drawCalls})`)
  ctx.ok(`field: density control and api set the drawn count; ${half.drawCalls} draw call(s)`)
  await experienceTail({ ...ctx, path: '/lab/field', name: 'field' })
  return { count: diag.count, side: diag.side, settle: { a: onA.mean, b: onB.mean }, pointer: { before: before.near, after: afterPush.near } }
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
  await page.click('button[data-chapter="artefact"]')
  await page.waitForTimeout(1500)
  dom = await domState()
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
  await experienceTail({ ...ctx, path: '/lab/story', name: 'story', reducedCheck: async (rp) => {
    await rp.click('button[data-chapter="artefact"]')
    await rp.waitForTimeout(300)
    const after = await snapshot(rp)
    expect(after.chapter.index === 2 && after.progress === 0.68, `reduced motion: the chapter button cuts straight to the artefact (chapter ${after.chapter.index}, progress ${after.progress})`)
  } })
  return { chapters: d.chapters, transitions: t }
}

export async function runLabChecks(chromium, { url, label, pages, evidence }) {
  mkdirSync(evidence, { recursive: true })
  const browser = await chromium.launch({ headless: true })
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
  if (!url) {
    console.error('lab-checks: missing --url')
    process.exit(2)
  }
  const { chromium } = createRequire(import.meta.url)('playwright')
  try {
    await runLabChecks(chromium, { url, label, pages, evidence })
  } catch (error) {
    console.error(`check-lab (${label}): ${error.message}`)
    process.exit(1)
  }
}
