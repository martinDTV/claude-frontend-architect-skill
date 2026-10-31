/**
 * Asset lab: loads every fixture variant through the asset cache with the real decoders, measures transfer, decode,
 * upload and first frame per variant with renderer.info deltas, exercises the error kinds, sharing, the late result
 * after an abort and the GLTF clip on an instance. Diagnostics on `window.__lab`; mounted by /lab/assets.
 */
import * as THREE from 'three'
import { createSceneRuntime, type SceneRuntime } from '../engine/scene-runtime'
import { createClipPlayer } from '../cinematic/clip-player'
import { AssetError, createAssetCache, type AssetCache, type ModelHandle } from '../assets/asset-cache'
import { createLoaders } from '../assets/loaders'
import { createStudioEnvironment, applyEnvironment } from '../rendering/environment'

export interface VariantMeasure {
  name: string
  url: string
  bytes: number
  /** transferSize from Resource Timing when the entry exists (same origin), else null */
  transfer: number | null
  /** network part of fetchMs (Resource Timing responseEnd - startTime); fetchMs is wall time from the request to the buffer */
  networkMs: number | null
  fetchMs: number
  parseMs: number
  compileMs: number
  firstFrameMs: number
  stats: { meshes: number; geometries: number; materials: number; textures: number; triangles: number }
  memoryDelta: { geometries: number; textures: number }
  afterRelease: { geometries: number; textures: number }
  error: string | null
}
export interface AssetsLabDiagnostics {
  ready: boolean
  errors: string[]
  capabilities: { draco: boolean; ktx2: boolean; meshopt: boolean }
  baseline: { geometries: number; textures: number }
  variants: VariantMeasure[]
  failures: Record<string, string>
  sharing: { sameAsset: boolean; instances: number; geometriesWithTwo: number; geometriesWithOne: number; afterBoth: number }
  late: { rejected: string; hasAfter: boolean; evicted: string[] }
  clip: { name: string; duration: number; capYAtHalf: number; capYAtStart: number; grilleInfluenceAtHalf: number; knobTurned: boolean }
  runtime: ReturnType<SceneRuntime['stats']> | null
  disposed: boolean
  afterDispose: { geometries: number; textures: number } | null
}

declare global {
  interface Window {
    __lab?: unknown
  }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function mountAssetsLab(canvas: HTMLCanvasElement): Promise<{ diagnostics: AssetsLabDiagnostics; dispose: () => void }> {
  const diagnostics: AssetsLabDiagnostics = { ready: false, errors: [], capabilities: { draco: false, ktx2: false, meshopt: false }, baseline: { geometries: 0, textures: 0 }, variants: [], failures: {}, sharing: { sameAsset: false, instances: 0, geometriesWithTwo: 0, geometriesWithOne: 0, afterBoth: 0 }, late: { rejected: '', hasAfter: true, evicted: [] }, clip: { name: '', duration: 0, capYAtHalf: 0, capYAtStart: 0, grilleInfluenceAtHalf: 0, knobTurned: false }, runtime: null, disposed: false, afterDispose: null }
  window.__lab = diagnostics
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    diagnostics.errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ').slice(0, 300))
    originalError.apply(console, args)
  }
  const runtime = createSceneRuntime({ canvas, maxPixelRatio: 1 })
  const { renderer, scene, camera, registry } = runtime
  const memory = () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures })
  camera.position.set(1.6, 1.2, 2.4)
  camera.lookAt(0, 0.6, 0)
  scene.background = new THREE.Color('#111218')
  const environment = createStudioEnvironment(renderer, registry)
  applyEnvironment(scene, environment.texture, { intensity: 0.9 })
  scene.add(new THREE.DirectionalLight('#fff4e6', 2))
  {
    // the renderer's own placeholder allocations happen the first time a lit built-in material renders: take that
    // baseline with a throwaway mesh so the per-variant deltas measure the models alone
    const probe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial())
    scene.add(probe)
    renderer.render(scene, camera)
    scene.remove(probe)
    probe.geometry.dispose()
    probe.material.dispose()
    renderer.render(scene, camera)
  }
  diagnostics.baseline = memory()

  const evicted: string[] = []
  const loaders = createLoaders({ dracoPath: '/draco/', ktx2Path: '/basis/', renderer })
  diagnostics.capabilities = loaders.capabilities
  const cache: AssetCache = createAssetCache({ loaders, registry, onEvict: (url, reason) => evicted.push(`${reason}:${url.split('/').pop()}`) })
  const timing = (url: string) => {
    const entry = performance.getEntriesByName(new URL(url, location.href).href).pop() as PerformanceResourceTiming | undefined
    return { transfer: entry ? entry.transferSize || entry.encodedBodySize || null : null, networkMs: entry ? entry.responseEnd - entry.startTime : null }
  }

  // 1. every variant: transfer, decode, upload, first frame, memory
  for (const [name, file] of [['plain', 'atelier.glb'], ['draco', 'atelier.draco.glb'], ['meshopt', 'atelier.meshopt.glb'], ['ktx2', 'atelier.ktx2.glb'], ['untextured', 'atelier.untextured.glb']] as const) {
    const url = `/models/${file}`
    const before = memory()
    const row: VariantMeasure = { name, url, bytes: 0, transfer: null, networkMs: null, fetchMs: 0, parseMs: 0, compileMs: 0, firstFrameMs: 0, stats: { meshes: 0, geometries: 0, materials: 0, textures: 0, triangles: 0 }, memoryDelta: { geometries: 0, textures: 0 }, afterRelease: { geometries: 0, textures: 0 }, error: null }
    try {
      const handle = await cache.load(url)
      row.bytes = handle.asset.stats.bytes
      const resource = timing(url)
      row.transfer = resource.transfer
      row.networkMs = resource.networkMs
      row.fetchMs = handle.asset.timings.fetchMs
      row.parseMs = handle.asset.timings.parseMs
      row.stats = { meshes: handle.asset.stats.meshes, geometries: handle.asset.stats.geometries, materials: handle.asset.stats.materials, textures: handle.asset.stats.textures, triangles: handle.asset.stats.triangles }
      const instance = handle.instantiate()
      scene.add(instance.root)
      const t0 = performance.now()
      renderer.compile(scene, camera)
      const t1 = performance.now()
      renderer.render(scene, camera)
      const t2 = performance.now()
      row.compileMs = t1 - t0
      row.firstFrameMs = t2 - t1
      const after = memory()
      row.memoryDelta = { geometries: after.geometries - before.geometries, textures: after.textures - before.textures }
      scene.remove(instance.root)
      instance.dispose()
      handle.release()
      const released = memory()
      row.afterRelease = { geometries: released.geometries - before.geometries, textures: released.textures - before.textures }
    } catch (error) {
      row.error = error instanceof AssetError ? error.kind : String(error)
    }
    diagnostics.variants.push(row)
  }

  // 2. failures: truncated, missing, and decoders absent
  const bare = createAssetCache({ loaders: createLoaders({ meshopt: false }) })
  for (const [label, c, url] of [['truncated', cache, '/models/atelier.truncated.glb'], ['missing', cache, '/models/nope.glb'], ['draco-no-decoder', bare, '/models/atelier.draco.glb'], ['ktx2-no-decoder', bare, '/models/atelier.ktx2.glb'], ['meshopt-no-decoder', bare, '/models/atelier.meshopt.glb']] as const) {
    try {
      const h = await c.load(url)
      h.release()
      diagnostics.failures[label] = 'loaded'
    } catch (error) {
      diagnostics.failures[label] = error instanceof AssetError ? error.kind : `other:${String(error).slice(0, 60)}`
    }
  }
  bare.dispose()

  // 3. sharing: two handles, two instances, one set of GPU resources
  {
    const before = memory()
    const [a, b] = await Promise.all([cache.load('/models/atelier.glb'), cache.load('/models/atelier.glb')])
    const one = a.instantiate()
    const two = b.instantiate()
    scene.add(one.root, two.root)
    renderer.render(scene, camera)
    const withTwo = memory().geometries - before.geometries
    scene.remove(two.root)
    two.dispose()
    b.release()
    renderer.render(scene, camera)
    const withOne = memory().geometries - before.geometries
    scene.remove(one.root)
    one.dispose()
    a.release()
    diagnostics.sharing = { sameAsset: a.asset === b.asset, instances: 2, geometriesWithTwo: withTwo, geometriesWithOne: withOne, afterBoth: memory().geometries - before.geometries }
  }

  // 4. a load aborted at once: the late result is discarded, nothing stays in the cache
  {
    const controller = new AbortController()
    const pending = cache.load('/models/atelier.meshopt.glb', { signal: controller.signal })
    controller.abort()
    try {
      await pending
      diagnostics.late.rejected = 'resolved'
    } catch (error) {
      diagnostics.late.rejected = error instanceof AssetError ? error.kind : 'other'
    }
    await wait(1500)
    diagnostics.late.hasAfter = cache.has('/models/atelier.meshopt.glb')
    diagnostics.late.evicted = evicted.filter((e) => /meshopt/.test(e))
  }

  // 5. the clip from the file plays on an instance; the model stays on screen for the screenshot
  const shown: ModelHandle = await cache.load('/models/atelier.glb')
  const instance = shown.instantiate()
  scene.add(instance.root)
  const player = createClipPlayer(instance.root, instance.clips)
  const cap = instance.parts.get('cap')!
  const knob = instance.parts.get('knob')!
  const grille = instance.parts.get('grille')!
  const clip = instance.clips[0]!
  player.seek(clip.name, 0)
  const capYAtStart = cap.position.y
  const knobStart = knob.quaternion.clone()
  player.seek(clip.name, 0.5)
  diagnostics.clip = { name: clip.name, duration: clip.duration, capYAtHalf: cap.position.y, capYAtStart, grilleInfluenceAtHalf: grille.morphTargetInfluences?.[0] ?? 0, knobTurned: knob.quaternion.angleTo(knobStart) > 1 }
  player.seek(clip.name, 0.25)
  runtime.loop.add('animation', (frame) => player.update(frame.delta), 'clip')
  player.play(clip.name)
  runtime.start()

  diagnostics.runtime = runtime.stats()
  diagnostics.ready = true
  return {
    diagnostics,
    dispose() {
      player.dispose()
      scene.remove(instance.root)
      instance.dispose()
      shown.release()
      cache.dispose()
      environment.dispose()
      runtime.dispose()
      diagnostics.disposed = true
      diagnostics.afterDispose = memory()
      console.error = originalError
    },
  }
}
