/**
 * Particle lab: proves the GPGPU simulation (float read-back, convergence, morph, pointer), compares the JavaScript
 * cost per frame of the GPGPU, instanced and CPU systems at three counts, runs the adaptive density controller on
 * real frame times, forces a context loss and restore, and disposes to the renderer's baseline. Diagnostics on
 * `window.__lab` for verification/browser/lab-checks.mjs; mounted by /lab/particles in the Nuxt and Next apps.
 */
import * as THREE from 'three'
import { createSceneRuntime } from '../engine/scene-runtime'
import { createCpuSimulation } from '../particles/cpu-simulation'
import { DEFAULT_TIERS, createDensityController } from '../particles/density-controller'
import { meanDistance, sphereFormation, surfaceFormation } from '../particles/formations'
import { createGpgpuSimulation, type GpgpuSimulation } from '../particles/gpgpu-simulation'
import { createInstancedField } from '../particles/instanced-field'

export interface BenchRow {
  mode: 'gpgpu' | 'instanced' | 'cpu'
  count: number
  /** mean JavaScript time per frame spent in the system's update, ms */
  jsMs: number
  /** frame-to-frame time, ms */
  frameMs: { p50: number; p95: number }
  drawCalls: number
  frames: number
}
export interface ParticlesLabDiagnostics {
  ready: boolean
  errors: string[]
  renderer: string
  floatTargets: boolean
  gpgpu: { side: number; count: number; steps: number; finite: boolean; meanStart: number; meanSettled: number; meanMorphed: number; nearPointerBefore: number; nearPointerAfter: number }
  bench: BenchRow[]
  adaptive: { tiers: string[]; finalTier: string; finalDrawn: number; fullCount: number; pixelRatio: number; average: number }
  contextLoss: { supported: boolean; lost: number; restored: number; framesWhileLost: number; framesAfterRestore: number; rebuilt: boolean }
  rendererBaseline: { textures: number; geometries: number }
  runtime: unknown
  disposed: boolean
  afterDispose: { geometries: number; textures: number } | null
}

declare global {
  interface Window {
    __lab?: unknown
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
}

export async function mountParticlesLab(canvas: HTMLCanvasElement): Promise<{ diagnostics: ParticlesLabDiagnostics; dispose: () => void }> {
  const diagnostics: ParticlesLabDiagnostics = {
    ready: false, errors: [], renderer: '', floatTargets: false,
    gpgpu: { side: 0, count: 0, steps: 0, finite: false, meanStart: 0, meanSettled: 0, meanMorphed: 0, nearPointerBefore: 0, nearPointerAfter: 0 },
    bench: [], adaptive: { tiers: [], finalTier: '', finalDrawn: 0, fullCount: 0, pixelRatio: 0, average: 0 },
    contextLoss: { supported: false, lost: 0, restored: 0, framesWhileLost: 0, framesAfterRestore: 0, rebuilt: false },
    rendererBaseline: { textures: 0, geometries: 0 }, runtime: null, disposed: false, afterDispose: null,
  }
  window.__lab = diagnostics
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    diagnostics.errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ').slice(0, 300))
    originalError.apply(console, args)
  }

  let rebuilt = false
  const runtime = createSceneRuntime({
    canvas,
    maxPixelRatio: 1,
    onContextRestored: () => {
      // GPGPU state does not survive a context loss: rebuild the system from its formations
      if (active) {
        active.dispose()
        active = buildShow()
        rebuilt = true
      }
    },
  })
  const { renderer, registry, scene, camera } = runtime
  const gl = renderer.getContext()
  const debug = gl.getExtension('WEBGL_debug_renderer_info')
  diagnostics.renderer = String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  diagnostics.floatTargets = Boolean(gl.getExtension('EXT_color_buffer_float'))
  {
    const geometry = new THREE.BoxGeometry()
    const material = new THREE.MeshStandardMaterial()
    const s = new THREE.Scene()
    s.add(new THREE.Mesh(geometry, material), new THREE.DirectionalLight(0xffffff, 1))
    renderer.render(s, camera)
    geometry.dispose()
    material.dispose()
    diagnostics.rendererBaseline = { textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }
  }
  camera.position.set(0, 0, 7)
  camera.lookAt(0, 0, 0)
  scene.background = new THREE.Color('#07070d')

  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.4, 0.4, 128, 16))
  const formations = (count: number) => ({ a: sphereFormation(count, 2), b: surfaceFormation(knot, count, 11) })

  // 1. GPGPU correctness at 64² with the turbulence off: converge on A, morph to B, react to the pointer
  {
    const side = 64
    const count = side * side
    const { a, b } = formations(count)
    const sim = createGpgpuSimulation(renderer, registry, { side, formationA: a, formationB: b })
    sim.velocity.uCurl.value = 0
    const read = () => sim.readPositions()
    const start = read()
    diagnostics.gpgpu.meanStart = meanDistance(start, a, count, 4, 3)
    for (let i = 0; i < 180; i++) sim.compute(1 / 60)
    const settled = read()
    diagnostics.gpgpu.meanSettled = meanDistance(settled, a, count, 4, 3)
    sim.velocity.uMorph.value = 1
    for (let i = 0; i < 240; i++) sim.compute(1 / 60)
    const morphed = read()
    diagnostics.gpgpu.meanMorphed = meanDistance(morphed, b, count, 4, 3)
    let finite = true
    for (let i = 0; i < morphed.length; i++) if (!Number.isFinite(morphed[i])) finite = false
    diagnostics.gpgpu.finite = finite
    // pointer on the first target point of formation B, radius 1
    const px = b[0] ?? 0
    const py = b[1] ?? 0
    const pz = b[2] ?? 0
    const near = (data: Float32Array) => {
      let n = 0
      for (let i = 0; i < count; i++) if (Math.hypot((data[i * 4] ?? 0) - px, (data[i * 4 + 1] ?? 0) - py, (data[i * 4 + 2] ?? 0) - pz) < 0.6) n++
      return n
    }
    diagnostics.gpgpu.nearPointerBefore = near(morphed)
    sim.velocity.uPointer.value.set(px, py, pz)
    sim.velocity.uPointerStrength.value = 40
    sim.velocity.uPointerRadius.value = 1
    for (let i = 0; i < 60; i++) sim.compute(1 / 60)
    diagnostics.gpgpu.nearPointerAfter = near(read())
    diagnostics.gpgpu.side = side
    diagnostics.gpgpu.count = count
    diagnostics.gpgpu.steps = sim.steps
    sim.dispose()
    sim.points.geometry.dispose()
    ;(sim.points.material as THREE.Material).dispose()
  }

  // 2. the comparison: JavaScript ms per frame and frame time for three systems at three counts, 45 frames each
  type Active = { object: THREE.Object3D; update: (delta: number) => number; dispose: () => void; setCount?: (n: number) => void; drawn?: () => number }
  const build = (mode: BenchRow['mode'], count: number): Active => {
    const { a, b } = formations(count)
    if (mode === 'gpgpu') {
      const side = Math.round(Math.sqrt(count))
      const sim: GpgpuSimulation = createGpgpuSimulation(renderer, registry, { side, formationA: a, formationB: b })
      sim.velocity.uMorph.value = 0.5
      return {
        object: sim.points,
        update: (delta) => { const t0 = performance.now(); sim.compute(delta); return performance.now() - t0 },
        dispose: () => { sim.dispose(); sim.points.geometry.dispose(); (sim.points.material as THREE.Material).dispose(); registry.forget(sim.points.geometry); registry.forget(sim.points.material as THREE.Material) },
        setCount: (n) => sim.setCount(n),
        drawn: () => sim.drawn,
      }
    }
    if (mode === 'instanced') {
      const field = createInstancedField(registry, { count, formationA: a, formationB: b, size: 0.04 })
      field.uniforms.uMorph.value = 0.5
      return {
        object: field.mesh,
        update: (delta) => { const t0 = performance.now(); field.update(delta); return performance.now() - t0 },
        dispose: () => { field.mesh.geometry.dispose(); (field.mesh.material as THREE.Material).dispose(); registry.forget(field.mesh.geometry); registry.forget(field.mesh.material as THREE.Material) },
        setCount: (n) => field.setCount(n),
        drawn: () => field.count,
      }
    }
    const sim = createCpuSimulation({ count, formationA: a, formationB: b })
    sim.morph = 0.5
    const geometry = new THREE.BufferGeometry()
    const attribute = new THREE.BufferAttribute(sim.positions, 3)
    attribute.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', attribute)
    const material = new THREE.PointsMaterial({ size: 0.04, color: '#9ad8ff', transparent: true, opacity: 0.85, depthWrite: false })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    return {
      object: points,
      update: (delta) => { const t0 = performance.now(); sim.step(delta); attribute.needsUpdate = true; return performance.now() - t0 },
      dispose: () => { geometry.dispose(); material.dispose() },
    }
  }
  let active: Active | null = null
  let measuring: { js: number[]; frames: number[]; last: number; done: (() => void) | null; target: number } | null = null
  runtime.loop.add('simulation', (frame) => {
    if (!active) return
    const js = active.update(frame.delta)
    if (measuring) {
      const now = performance.now()
      if (measuring.last > 0) {
        measuring.js.push(js)
        measuring.frames.push(now - measuring.last)
      }
      measuring.last = now
      if (measuring.frames.length >= measuring.target && measuring.done) {
        const done = measuring.done
        measuring.done = null
        done()
      }
    }
  }, 'particles')
  const measure = (mode: BenchRow['mode'], count: number, frames: number) => new Promise<BenchRow>((resolve) => {
    active = build(mode, count)
    scene.add(active.object)
    measuring = { js: [], frames: [], last: 0, target: frames, done: null }
    measuring.done = () => {
      const m = measuring!
      const row: BenchRow = { mode, count, jsMs: m.js.reduce((s, v) => s + v, 0) / Math.max(1, m.js.length), frameMs: { p50: percentile(m.frames, 0.5), p95: percentile(m.frames, 0.95) }, drawCalls: renderer.info.render.calls, frames: m.frames.length }
      measuring = null
      scene.remove(active!.object)
      active!.dispose()
      active = null
      resolve(row)
    }
  })
  runtime.start()
  // the comparison is about JavaScript cost per particle, so the fill cost is kept small: a 320×180 canvas for the
  // benchmark (software renderers spend most of a frame rasterising 65k additive sprites otherwise)
  canvas.style.width = '320px'
  canvas.style.height = '180px'
  await wait(300) // the resize observer and the first frames of a fresh context (program compilation)
  for (const count of [4096, 16384, 65536]) {
    for (const mode of ['gpgpu', 'instanced', 'cpu'] as const) diagnostics.bench.push(await measure(mode, count, 30))
  }
  canvas.style.width = ''
  canvas.style.height = ''
  await wait(100)

  // 3. adaptive density on real frame times with the heaviest GPGPU system
  const buildShow = (): Active => {
    const show = build('gpgpu', 65536)
    scene.add(show.object)
    return show
  }
  active = buildShow()
  {
    const controller = createDensityController({ budgetMs: 16.7, downAfter: 6, upAfter: 60, cooldown: 4, smoothing: 0.3 })
    const full = 65536
    const applyTier = () => {
      const tier = controller.tier
      active?.setCount?.(Math.round(full * tier.density))
      renderer.setPixelRatio(Math.min(1, tier.pixelRatio))
    }
    const remove = runtime.loop.add('state', (frame) => {
      if (frame.delta > 0 && controller.sample(frame.delta * 1000)) applyTier()
    }, 'density')
    await wait(1800)
    remove()
    diagnostics.adaptive = { tiers: controller.history.map((h) => DEFAULT_TIERS[h.index]?.name ?? '?'), finalTier: controller.tier.name, finalDrawn: active?.drawn?.() ?? 0, fullCount: full, pixelRatio: renderer.getPixelRatio(), average: controller.average }
  }

  // 4. context loss and restore (WEBGL_lose_context), the system rebuilt on restore
  {
    const ext = gl.getExtension('WEBGL_lose_context')
    diagnostics.contextLoss.supported = Boolean(ext)
    if (ext) {
      const before = runtime.stats()
      ext.loseContext()
      await wait(400)
      const lost = runtime.stats()
      diagnostics.contextLoss.lost = lost.contextLost
      diagnostics.contextLoss.framesWhileLost = lost.frames - before.frames
      await wait(200)
      diagnostics.contextLoss.framesWhileLost = runtime.stats().frames - before.frames
      ext.restoreContext()
      await wait(800)
      const restored = runtime.stats()
      diagnostics.contextLoss.restored = restored.contextRestored
      diagnostics.contextLoss.rebuilt = rebuilt
      const mark = restored.frames
      await wait(500)
      diagnostics.contextLoss.framesAfterRestore = runtime.stats().frames - mark
    }
  }

  // leave the page light so a route change is not starved by a software renderer drawing 65k sprites per frame
  active?.setCount?.(2048)
  diagnostics.runtime = runtime.stats()
  diagnostics.ready = true
  return {
    diagnostics,
    dispose() {
      if (active) {
        scene.remove(active.object)
        active.dispose()
        active = null
      }
      knot.geometry.dispose()
      runtime.dispose()
      diagnostics.disposed = true
      diagnostics.afterDispose = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }
      console.error = originalError
    },
  }
}
