# Asset pipeline: GLTF, compression, caching, ownership

Real models in production: GLB with Draco or meshopt geometry and KTX2 textures, loaded through one cache that deduplicates requests, counts holders, instantiates copies that share GPU resources, cancels cleanly, classifies failures, falls back between formats and releases everything when the last holder lets go. The fixtures are an original multi-part product generated procedurally (`verification/assets/make-fixtures.mjs`, no third-party asset, no licence to track); the cache is tested in Node against them and measured in Chromium (`/lab/assets`).

## Contents

1. The four stages and what each costs
2. Formats: what the fixtures measure
3. Loaders and decoders
4. The asset cache
5. Instances and ownership
6. Progressive loading, priorities, cancellation, late results
7. Errors and fallback chains
8. SSR and frameworks
9. Tests

## 1. The four stages and what each costs

| Stage | What happens | Measured by | Reduced by |
|---|---|---|---|
| **Transfer** | bytes over the network | `Resource Timing` (`responseEnd - startTime`, the network part) next to `fetchMs` in the cache (wall time from the request to the buffer, which also contains whatever keeps the main thread busy: in a software-rendered page it ran 500 ms above the network time) | Draco or meshopt for geometry, KTX2 (Basis) for textures, fewer requests |
| **Decode** | `GLTFLoader.parse`: JSON, buffers, Draco/meshopt decompression (workers), image decode | `parseMs` in the cache | smaller geometry, fewer images, decoders warmed up |
| **Upload** | the first time a geometry, texture or program meets the GPU | `renderer.compile()` timing, `renderer.info.memory` delta | `renderer.compile` ahead of the reveal, KTX2 (uploaded as-is, no CPU decode), shared materials |
| **Render** | per-frame cost of the model | `renderer.info.render.calls/triangles`, frame time | instancing, merged parts, lower LOD, fewer materials |

A 50 KB file that takes 40 ms to decode and 80 ms to upload at the worst moment (the first scroll) is slower than a 200 KB file decoded during the hero's first second and compiled before the reveal. The pipeline separates the stages so the experience can schedule them.

## 2. Formats: what the fixtures measure

`verification/assets/fixtures/manifest.json` records the bytes of one model (six parts, 1,090 triangles, one 64×64 texture, one 2 s clip with translation, rotation and morph-weight tracks):

| File | Geometry | Texture | Bytes | Needs |
|---|---|---|---|---|
| `atelier.glb` | raw float32 | PNG (382 B) | 55,516 | nothing |
| `atelier.draco.glb` | Draco (edgebreaker, 14/10/12-bit quantisation) | PNG | 16,476 | `DRACOLoader` + decoder files (`public/draco`) |
| `atelier.meshopt.glb` | `EXT_meshopt_compression` | PNG | 35,340 | `MeshoptDecoder` (a module, no files) |
| `atelier.ktx2.glb` | raw | KTX2 RGBA8 (16,608 B) | 71,868 | `KTX2Loader` + transcoder files (`public/basis`) |

Honest reading: Draco cuts this geometry to 30%, meshopt to 64% (meshopt decodes faster and streams; Draco compresses harder). The KTX2 fixture is **larger** than the PNG one because it is uncompressed RGBA8: the Basis Universal encoder that makes KTX2 worth it (UASTC/ETC1S, uploaded without CPU decode, a fraction of the GPU memory of a PNG) is not shipped with Three.js and this repository does not install it; the loader path is exercised, the size and memory benefit is not demonstrated here. Morph targets and animation tracks stay uncompressed in every variant.

## 3. Loaders and decoders

One `GLTFLoader` per cache with its decoders attached once: `DRACOLoader` (WebAssembly in workers; `dispose()` ends them), `KTX2Loader` (needs the renderer to detect the GPU's compressed formats), `MeshoptDecoder` (a module). Decoders are heavy and shared; the cache owns them.

```ts
// @verify creative:assets/loaders.ts nuxt:lib/lab/assets/loaders.ts next:lib/lab/assets/loaders.ts
import type * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

export interface LoaderOptions {
  /** URL prefix of the Draco decoder files (draco_decoder.wasm, draco_wasm_wrapper.js); omit to refuse Draco files */
  dracoPath?: string
  /** URL prefix of the Basis transcoder files; needs the renderer; omit to refuse KTX2 textures */
  ktx2Path?: string
  renderer?: THREE.WebGLRenderer
  /** attach the meshopt decoder (default true) */
  meshopt?: boolean
}
export interface Loaders {
  loader: GLTFLoader
  capabilities: { draco: boolean; ktx2: boolean; meshopt: boolean }
  dispose(): void
}

export function createLoaders(options: LoaderOptions = {}): Loaders {
  const loader = new GLTFLoader()
  let draco: DRACOLoader | null = null
  let ktx2: KTX2Loader | null = null
  if (options.dracoPath) {
    draco = new DRACOLoader().setDecoderPath(options.dracoPath)
    loader.setDRACOLoader(draco)
  }
  if (options.ktx2Path && options.renderer) {
    ktx2 = new KTX2Loader().setTranscoderPath(options.ktx2Path).detectSupport(options.renderer)
    loader.setKTX2Loader(ktx2)
  }
  const meshopt = options.meshopt ?? true
  if (meshopt) loader.setMeshoptDecoder(MeshoptDecoder)
  return {
    loader,
    capabilities: { draco: Boolean(draco), ktx2: Boolean(ktx2), meshopt },
    dispose() {
      draco?.dispose()
      ktx2?.dispose()
    },
  }
}
```

## 4. The asset cache

One entry per URL. A `load()` returns a **handle**; several handles share one parsed master; the master is disposed when the last handle is released (or when the cache itself is disposed on app teardown). Concurrent loads of one URL share one fetch and one parse. Every entry records bytes, fetch and parse time, and the unique geometries, materials, textures and triangles it holds.

```ts
// @verify creative:assets/asset-cache.ts nuxt:lib/lab/assets/asset-cache.ts next:lib/lab/assets/asset-cache.ts
import * as THREE from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { ResourceRegistry } from '../engine/resource-registry'
import type { Loaders } from './loaders'

export type AssetErrorKind = 'network' | 'aborted' | 'parse' | 'decoder-missing'
export class AssetError extends Error {
  constructor(public readonly kind: AssetErrorKind, public readonly url: string, message: string, public override readonly cause?: unknown) {
    super(`${kind}: ${url}: ${message}`)
    this.name = 'AssetError'
  }
}

export interface AssetStats {
  bytes: number
  geometries: number
  materials: number
  textures: number
  triangles: number
  meshes: number
}
export interface ModelAsset {
  url: string
  /** the master graph: never add it to a scene, instantiate it */
  master: THREE.Group
  clips: THREE.AnimationClip[]
  stats: AssetStats
  timings: { fetchMs: number; parseMs: number }
}
export interface ModelInstance {
  root: THREE.Group
  /** meshes by node name (the parts of a product) */
  parts: Map<string, THREE.Mesh>
  clips: THREE.AnimationClip[]
  /** disposes what the instance owns: cloned materials when `ownMaterials` was requested; geometries stay with the master */
  dispose(): void
}
export interface ModelHandle {
  readonly asset: ModelAsset
  /** a copy sharing the master's geometries and materials (skinned meshes cloned with SkeletonUtils) */
  instantiate(options?: { ownMaterials?: boolean }): ModelInstance
  release(): void
  readonly released: boolean
}
export interface LoadOptions {
  signal?: AbortSignal
  /** higher first when the concurrency limit queues requests */
  priority?: number
}
export interface AssetCacheOptions {
  loaders: Loaders
  fetchImpl?: typeof fetch
  /** concurrent fetch+parse operations (default 4) */
  concurrency?: number
  /** registers master geometries, materials and textures as `shared` so a runtime's graph disposal keeps them */
  registry?: ResourceRegistry
  /** called when a master is disposed (last holder gone, late result discarded, or cache disposed) */
  onEvict?: (url: string, reason: 'released' | 'discarded' | 'disposed') => void
}
export interface AssetCache {
  load(url: string, options?: LoadOptions): Promise<ModelHandle>
  /** tries each URL in order until one loads (format fallback: draco → plain) */
  loadFirst(urls: string[], options?: LoadOptions): Promise<ModelHandle>
  preload(urls: string[], priority?: number): void
  has(url: string): boolean
  holders(url: string): number
  stats(): { entries: number; inflight: number; queued: number; bytes: number; geometries: number; textures: number }
  dispose(): void
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export function classifyError(error: unknown, url: string): AssetError {
  if (error instanceof AssetError) return error
  const message = error instanceof Error ? error.message : String(error)
  if (/DRACOLoader|setMeshoptDecoder|KTX2Loader|No .*Loader instance/i.test(message)) return new AssetError('decoder-missing', url, message, error)
  if (error instanceof DOMException && error.name === 'AbortError') return new AssetError('aborted', url, message, error)
  if (/fetch|network|HTTP \d+/i.test(message)) return new AssetError('network', url, message, error)
  return new AssetError('parse', url, message, error)
}

function measure(master: THREE.Object3D): Omit<AssetStats, 'bytes'> {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  let triangles = 0
  let meshes = 0
  master.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    meshes++
    geometries.add(mesh.geometry)
    const index = mesh.geometry.index
    triangles += (index ? index.count : mesh.geometry.getAttribute('position').count) / 3
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(m)
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  return { geometries: geometries.size, materials: materials.size, textures: textures.size, triangles, meshes }
}

function disposeMaster(master: THREE.Object3D, registry?: ResourceRegistry) {
  const done = new Set<object>()
  master.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if (!done.has(mesh.geometry)) {
      done.add(mesh.geometry)
      registry?.forget(mesh.geometry)
      mesh.geometry.dispose()
    }
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (done.has(m)) continue
      done.add(m)
      for (const value of Object.values(m)) {
        if (value instanceof THREE.Texture && !done.has(value)) {
          done.add(value)
          registry?.forget(value)
          value.dispose()
        }
      }
      registry?.forget(m)
      m.dispose()
    }
  })
  master.clear()
}

interface Entry {
  asset: ModelAsset | null
  promise: Promise<ModelAsset> | null
  holders: number
  waiters: number
}

export function createAssetCache(options: AssetCacheOptions): AssetCache {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const concurrency = Math.max(1, options.concurrency ?? 4)
  const entries = new Map<string, Entry>()
  const queue: { url: string; priority: number; run: () => void }[] = []
  let active = 0
  let disposed = false

  const pump = () => {
    queue.sort((a, b) => b.priority - a.priority)
    while (active < concurrency && queue.length) {
      const next = queue.shift()!
      active++
      next.run()
    }
  }
  const schedule = (url: string, priority: number, task: () => Promise<void>) =>
    new Promise<void>((resolve) => {
      queue.push({ url, priority, run: () => { task().finally(() => { active--; resolve(); pump() }) } })
      pump()
    })

  const evict = (url: string, entry: Entry, reason: 'released' | 'discarded' | 'disposed') => {
    if (entry.asset) disposeMaster(entry.asset.master, options.registry)
    entries.delete(url)
    options.onEvict?.(url, reason)
  }

  const parse = (url: string, buffer: ArrayBuffer): Promise<GLTF> =>
    new Promise((resolve, reject) => {
      try {
        options.loaders.loader.parse(buffer, url.slice(0, url.lastIndexOf('/') + 1), resolve, reject)
      } catch (error) {
        reject(error)
      }
    })

  const start = (url: string, entry: Entry, priority: number): Promise<ModelAsset> =>
    new Promise<ModelAsset>((resolve, reject) => {
      void schedule(url, priority, async () => {
        try {
          const t0 = now()
          const response = await fetchImpl(url)
          if (!response.ok) throw new AssetError('network', url, `HTTP ${response.status}`)
          const buffer = await response.arrayBuffer()
          const t1 = now()
          const gltf = await parse(url, buffer)
          const t2 = now()
          const master = gltf.scene
          if (options.registry) {
            master.traverse((o) => {
              const mesh = o as THREE.Mesh
              if (!mesh.isMesh) return
              options.registry!.shared(mesh.geometry, `${url}#geometry`)
              for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                options.registry!.shared(m, `${url}#material`)
                for (const value of Object.values(m)) if (value instanceof THREE.Texture) options.registry!.shared(value, `${url}#texture`)
              }
            })
          }
          const asset: ModelAsset = { url, master, clips: gltf.animations, stats: { bytes: buffer.byteLength, ...measure(master) }, timings: { fetchMs: t1 - t0, parseMs: t2 - t1 } }
          entry.asset = asset
          entry.promise = null
          if (disposed || (entry.holders === 0 && entry.waiters === 0)) {
            // nobody is left to hold it: a late result after every caller aborted, or the cache was torn down
            evict(url, entry, disposed ? 'disposed' : 'discarded')
          }
          resolve(asset)
        } catch (error) {
          entry.promise = null
          entries.delete(url)
          reject(classifyError(error, url))
        }
      })
    })

  const handleFor = (url: string, entry: Entry, asset: ModelAsset): ModelHandle => {
    entry.holders++
    let released = false
    return {
      asset,
      instantiate(instanceOptions = {}) {
        if (released) throw new Error(`${url}: handle already released`)
        const hasSkinned = ((): boolean => { let s = false; asset.master.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) s = true }); return s })()
        const root = (hasSkinned ? cloneSkinned(asset.master) : asset.master.clone(true)) as THREE.Group
        const parts = new Map<string, THREE.Mesh>()
        const owned: THREE.Material[] = []
        root.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          if (instanceOptions.ownMaterials) {
            const cloned = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone()
            for (const m of Array.isArray(cloned) ? cloned : [cloned]) owned.push(m)
            mesh.material = cloned
          }
          if (mesh.name) parts.set(mesh.name, mesh)
        })
        return {
          root,
          parts,
          clips: asset.clips,
          dispose() {
            for (const m of owned) m.dispose()
            owned.length = 0
            root.clear()
          },
        }
      },
      release() {
        if (released) return
        released = true
        entry.holders--
        if (entry.holders === 0 && entry.waiters === 0 && entries.get(url) === entry) evict(url, entry, 'released')
      },
      get released() {
        return released
      },
    }
  }

  const load = async (url: string, loadOptions: LoadOptions = {}): Promise<ModelHandle> => {
    if (disposed) throw new AssetError('aborted', url, 'cache disposed')
    const { signal, priority = 0 } = loadOptions
    if (signal?.aborted) throw new AssetError('aborted', url, 'aborted before start')
    let entry = entries.get(url)
    if (!entry) {
      entry = { asset: null, promise: null, holders: 0, waiters: 0 }
      entries.set(url, entry)
      entry.promise = start(url, entry, priority)
    }
    if (entry.asset) return handleFor(url, entry, entry.asset)
    entry.waiters++
    try {
      const asset = await new Promise<ModelAsset>((resolve, reject) => {
        const onAbort = () => reject(new AssetError('aborted', url, 'aborted while loading'))
        signal?.addEventListener('abort', onAbort, { once: true })
        entry!.promise!.then(resolve, reject).finally(() => signal?.removeEventListener('abort', onAbort))
      })
      entry.waiters--
      return handleFor(url, entry, asset)
    } catch (error) {
      entry.waiters--
      // the last waiter gave up before the result: whatever arrives later is discarded in start()
      if (entry.asset && entry.holders === 0 && entry.waiters === 0 && entries.get(url) === entry) evict(url, entry, 'discarded')
      throw classifyError(error, url)
    }
  }

  return {
    load,
    async loadFirst(urls, loadOptions) {
      let last: unknown = new AssetError('network', urls[0] ?? '', 'no url')
      for (const url of urls) {
        try {
          return await load(url, loadOptions)
        } catch (error) {
          last = error
          if (error instanceof AssetError && error.kind === 'aborted') throw error
        }
      }
      throw last
    },
    preload(urls, priority = -1) {
      for (const url of urls) {
        if (entries.has(url)) continue
        const entry: Entry = { asset: null, holders: 0, waiters: 0, promise: null }
        entries.set(url, entry)
        entry.waiters++ // the preload keeps the result until a real load takes it or the cache is disposed
        entry.promise = start(url, entry, priority)
        entry.promise.then(() => { /* kept warm */ }, () => { /* reported to the first real load */ })
      }
    },
    has: (url) => Boolean(entries.get(url)?.asset),
    holders: (url) => entries.get(url)?.holders ?? 0,
    stats() {
      let bytes = 0
      let geometries = 0
      let textures = 0
      for (const e of entries.values()) if (e.asset) { bytes += e.asset.stats.bytes; geometries += e.asset.stats.geometries; textures += e.asset.stats.textures }
      return { entries: [...entries.values()].filter((e) => e.asset).length, inflight: active, queued: queue.length, bytes, geometries, textures }
    },
    dispose() {
      disposed = true
      for (const [url, entry] of [...entries]) if (entry.asset) evict(url, entry, 'disposed')
      queue.length = 0
      options.loaders.dispose()
    },
  }
}
```

## 5. Instances and ownership

An instance is a clone of the master whose meshes reference the master's geometries and materials: ten instances of a product cost one set of GPU buffers plus ten sets of matrices. Ownership follows: geometries, materials and textures of the master are `shared` (the cache disposes them with the last handle, and a registry marks them so a runtime's graph disposal leaves them alone); an instance owns only what it cloned for itself (`ownMaterials: true` for a per-instance colour). For hundreds of copies of one part, `InstancedMesh` from the master's geometry and material is one draw call:

```ts
// @verify creative:assets/instances.ts nuxt:lib/lab/assets/instances.ts next:lib/lab/assets/instances.ts
import * as THREE from 'three'
import type { ModelAsset } from './asset-cache'

/** One InstancedMesh per mesh part of the model, sharing the master's geometry and material; matrices per copy. */
export function instanceModel(asset: ModelAsset, count: number, placeAt: (index: number, matrix: THREE.Matrix4) => void): THREE.Group {
  const group = new THREE.Group()
  const matrix = new THREE.Matrix4()
  const partMatrix = new THREE.Matrix4()
  asset.master.updateMatrixWorld(true)
  asset.master.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, count)
    instanced.name = mesh.name
    for (let i = 0; i < count; i++) {
      placeAt(i, matrix)
      partMatrix.multiplyMatrices(matrix, mesh.matrixWorld)
      instanced.setMatrixAt(i, partMatrix)
    }
    instanced.instanceMatrix.needsUpdate = true
    group.add(instanced)
  })
  return group
}
```

## 6. Progressive loading, priorities, cancellation, late results

- **Priorities**: the hero model first, chapter two's model while chapter one plays, the configurator's variants when the user hovers the control. `load(url, { priority })` orders the queue; `concurrency` keeps the decoders from fighting the main thread.
- **Preload** (`preload([...])`) warms entries that a later `load` takes over instantly; a preloaded asset nobody ever takes is freed on `dispose()`.
- **Cancellation**: a route change aborts the signal; the caller gets `AssetError('aborted')`; the fetch may still complete (the browser's business) and the parse may still run for other waiters.
- **Late results**: a parse that completes after every caller aborted and no handle exists is disposed on arrival (`onEvict(url, 'discarded')`), not leaked into the cache; a parse that completes after the cache was disposed is disposed too. This is the case the detectors cannot see statically (`three-owned-resource-without-dispose` is heuristic for a reason): verify it with the tests in section 9.

## 7. Errors and fallback chains

| Kind | Cause | What to do |
|---|---|---|
| `network` | offline, 404, blocked | retry with backoff for transient codes; a 404 is a build error, surface it |
| `decoder-missing` | a Draco/meshopt/KTX2 file reached a loader without that decoder | `loadFirst([draco, plain])` falls back; in production ship the decoders with the app (`public/draco`, `public/basis`) |
| `parse` | truncated or invalid file | surface it; the DOM fallback (a still image, the text) carries the content |
| `aborted` | the caller left | nothing: it is the normal outcome of navigation |

The experience never shows a blank canvas on failure: the reduced-motion/no-WebGL fallback is the same path (`immersive-3d-architecture.md`).

## 8. SSR and frameworks

Loaders touch `fetch`, workers, `Image`/`createImageBitmap` and the GPU: they exist only on the client. The cache is created inside the client lifecycle (a composable in `onMounted`, a React effect, a module-level singleton behind a client-only import) and disposed with the app shell, not with each component; components hold handles. With React Three Fiber, `useLoader(GLTFLoader, url)` has its own cache keyed by URL and suspends; with TresJS, `useLoader`/`useGLTF` do the same. Those caches dispose nothing by themselves: the declarative experiences of `declarative-3d.md` wrap them with the handle discipline above or use this cache directly.

## 9. Tests

Node, against the generated fixtures and a fake `fetch` (the untextured GLB parses in Node; the textured ones need a browser for the image, the Draco and meshopt ones need their decoders, which is exactly what the error tests want):

```ts
// @verify creative:assets/asset-cache.test.ts
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createResourceRegistry } from '../engine/resource-registry'
import { disposeSceneGraph } from '../engine/dispose-graph'
import { AssetError, createAssetCache } from './asset-cache'
import { instanceModel } from './instances'
import { createLoaders } from './loaders'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'assets', 'fixtures')
const bytes = (name: string) => { const b = readFileSync(join(fixtures, name)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
const files: Record<string, ArrayBuffer> = { '/models/atelier.untextured.glb': bytes('atelier.untextured.glb'), '/models/atelier.draco.glb': bytes('atelier.draco.glb'), '/models/atelier.meshopt.glb': bytes('atelier.meshopt.glb') }
files['/models/broken.glb'] = files['/models/atelier.untextured.glb']!.slice(0, 20000)

function fakeFetch(log: string[] = [], options: { delayMs?: number; fail?: Set<string>; status?: Record<string, number> } = {}) {
  const impl = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    log.push(url)
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs))
    if (options.fail?.has(url)) throw new TypeError('Failed to fetch')
    const status = options.status?.[url] ?? (files[url] ? 200 : 404)
    return new Response(status === 200 ? files[url]! : null, { status })
  }
  return impl as typeof fetch
}
const makeCache = (log: string[] = [], extra: Parameters<typeof createAssetCache>[0] extends infer O ? Partial<O> : never = {}, fetchOptions = {}) =>
  createAssetCache({ loaders: createLoaders({ meshopt: false }), fetchImpl: fakeFetch(log, fetchOptions), ...extra })

describe('asset cache', () => {
  it('loads once for concurrent callers, shares one master between handles, instantiates copies that share GPU resources, and frees everything with the last release', async () => {
    const log: string[] = []
    const evicted: string[] = []
    const cache = makeCache(log, { onEvict: (url, reason) => evicted.push(`${reason}:${url}`) })
    const [a, b] = await Promise.all([cache.load('/models/atelier.untextured.glb'), cache.load('/models/atelier.untextured.glb')])
    expect(log).toEqual(['/models/atelier.untextured.glb'])
    expect(a.asset).toBe(b.asset)
    expect(a.asset.stats).toMatchObject({ meshes: 6, geometries: 6, materials: 6, textures: 0, triangles: 1090 })
    expect(a.asset.stats.bytes).toBe(files['/models/atelier.untextured.glb']!.byteLength)
    expect(a.asset.clips.map((c) => `${c.name}:${c.duration}:${c.tracks.length}`)).toEqual(['reveal:2:3'])
    expect(a.asset.timings.parseMs).toBeGreaterThanOrEqual(0)
    const one = a.instantiate()
    const two = b.instantiate({ ownMaterials: true })
    expect([...one.parts.keys()].sort()).toEqual(['base', 'body', 'cap', 'grille', 'knob', 'label'])
    expect(one.parts.get('knob')!.geometry).toBe(two.parts.get('knob')!.geometry) // shared geometry
    expect(one.parts.get('knob')!.material).toBe((a.asset.master.getObjectByName('knob') as THREE.Mesh).material) // shared material
    expect(two.parts.get('knob')!.material).not.toBe(one.parts.get('knob')!.material) // own materials on request
    expect(one.parts.get('grille')!.morphTargetInfluences?.length).toBe(1)
    const disposedGeometries: string[] = []
    a.asset.master.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.addEventListener('dispose', () => disposedGeometries.push(o.name)) })
    a.release()
    expect(cache.holders('/models/atelier.untextured.glb')).toBe(1)
    expect(disposedGeometries).toEqual([])
    two.dispose()
    b.release()
    expect(disposedGeometries.sort()).toEqual(['base', 'body', 'cap', 'grille', 'knob', 'label'])
    expect(cache.has('/models/atelier.untextured.glb')).toBe(false)
    expect(evicted).toEqual(['released:/models/atelier.untextured.glb'])
    expect(() => a.instantiate()).toThrow(/already released/)
    cache.dispose()
  })

  it('classifies failures: a 404 and a thrown fetch are network, a truncated file is parse, Draco and meshopt without their decoders are decoder-missing', async () => {
    const cache = makeCache([], {}, { fail: new Set(['/models/offline.glb']) })
    const kinds: Record<string, string> = {}
    for (const url of ['/models/missing.glb', '/models/offline.glb', '/models/broken.glb', '/models/atelier.draco.glb', '/models/atelier.meshopt.glb']) {
      try {
        await cache.load(url)
        kinds[url] = 'loaded'
      } catch (error) {
        kinds[url] = error instanceof AssetError ? error.kind : `other:${String(error)}`
      }
    }
    expect(kinds).toEqual({ '/models/missing.glb': 'network', '/models/offline.glb': 'network', '/models/broken.glb': 'parse', '/models/atelier.draco.glb': 'decoder-missing', '/models/atelier.meshopt.glb': 'decoder-missing' })
    expect(cache.stats().entries).toBe(0) // failures leave no entry behind
    cache.dispose()
  })

  it('falls back along a format chain and respects priorities under a concurrency limit', async () => {
    const log: string[] = []
    const cache = makeCache(log, { concurrency: 1 }, { delayMs: 5 })
    const handle = await cache.loadFirst(['/models/atelier.draco.glb', '/models/atelier.untextured.glb'])
    expect(handle.asset.url).toBe('/models/atelier.untextured.glb')
    handle.release()
    log.length = 0
    const low = cache.load('/models/broken.glb', { priority: 0 }).catch(() => null)
    const high = cache.load('/models/atelier.untextured.glb', { priority: 10 })
    const mid = cache.load('/models/missing.glb', { priority: 5 }).catch(() => null)
    await Promise.all([low, high, mid])
    // the first request started before the others were queued; the remaining two ran in priority order
    expect(log).toEqual(['/models/broken.glb', '/models/atelier.untextured.glb', '/models/missing.glb'])
    ;(await high).release()
    cache.dispose()
  })

  it('aborts cleanly and discards a late result nobody holds; a second waiter keeps it', async () => {
    const evicted: string[] = []
    const cache = makeCache([], { onEvict: (url, reason) => evicted.push(reason) }, { delayMs: 20 })
    const controller = new AbortController()
    const pending = cache.load('/models/atelier.untextured.glb', { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
    await new Promise((r) => setTimeout(r, 80)) // the fetch and parse still complete...
    expect(cache.has('/models/atelier.untextured.glb')).toBe(false) // ...and the master is disposed on arrival
    expect(evicted).toEqual(['discarded'])
    const first = cache.load('/models/atelier.untextured.glb', { signal: new AbortController().signal })
    const c2 = new AbortController()
    const second = cache.load('/models/atelier.untextured.glb', { signal: c2.signal })
    c2.abort()
    await expect(second).rejects.toMatchObject({ kind: 'aborted' })
    const kept = await first
    expect(cache.has('/models/atelier.untextured.glb')).toBe(true)
    kept.release()
    await expect(cache.load('/models/x.glb', { signal: AbortSignal.abort() })).rejects.toMatchObject({ kind: 'aborted' })
    cache.dispose()
  })

  it('marks master resources shared in a registry so a runtime graph disposal keeps them, and the cache dispose frees live handles', async () => {
    const registry = createResourceRegistry()
    const evicted: string[] = []
    const cache = makeCache([], { registry, onEvict: (_u, reason) => evicted.push(reason) })
    const handle = await cache.load('/models/atelier.untextured.glb')
    const instance = handle.instantiate()
    const scene = new THREE.Scene()
    scene.add(instance.root)
    const result = disposeSceneGraph(scene, registry)
    expect(result.geometries).toBe(0)
    expect(result.kept.length).toBe(12) // 6 geometries + 6 materials kept as shared
    expect(registry.counts().shared).toBe(12)
    const copies = instanceModel(handle.asset, 20, (i, m) => m.makeTranslation(i * 2, 0, 0))
    expect(copies.children.length).toBe(6)
    expect((copies.children[0] as THREE.InstancedMesh).count).toBe(20)
    expect((copies.children[0] as THREE.InstancedMesh).geometry).toBe((handle.asset.master.getObjectByName(copies.children[0]!.name) as THREE.Mesh).geometry)
    cache.dispose()
    expect(evicted).toEqual(['disposed'])
    expect(handle.released).toBe(false) // the handle object is unaware; the cache owns the resources and freed them
    expect(registry.counts().shared).toBe(0) // forgotten on disposal
  })

  it('preload warms an entry that a later load takes over without a second fetch', async () => {
    const log: string[] = []
    const cache = makeCache(log)
    cache.preload(['/models/atelier.untextured.glb'])
    await new Promise((r) => setTimeout(r, 30))
    expect(cache.has('/models/atelier.untextured.glb')).toBe(true)
    const handle = await cache.load('/models/atelier.untextured.glb')
    expect(log).toEqual(['/models/atelier.untextured.glb'])
    handle.release()
    expect(cache.has('/models/atelier.untextured.glb')).toBe(true) // the preload's claim still holds it
    cache.dispose()
    expect(cache.has('/models/atelier.untextured.glb')).toBe(false)
  })
})
```

Browser (`/lab/assets`, both apps): each variant loads with its decoder; bytes, fetch, parse and upload times and `renderer.info.memory` deltas per variant; Draco and KTX2 without decoder paths fail with `decoder-missing`; the truncated file fails with `parse`; a 404 with `network`; two handles share one master and the memory counters do not double; releasing the last handle returns the counters; a load aborted by navigation leaves nothing behind; the GLTF clip plays through the clip player on an instance.
