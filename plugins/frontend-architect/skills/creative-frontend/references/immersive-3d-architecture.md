# Immersive 3D architecture: time, ownership, runtime

How an ambitious 3D experience stays correct: one clock and one ordered update per frame, explicit ownership of every GPU resource, a runtime that pauses, resizes, survives a lost context and disposes exactly what it owns, and the same lifecycle rules in Vue/Nuxt, React/Next, TresJS and React Three Fiber. The code below is what the verification projects compile (creative, Nuxt and Next, from the same blocks), test in Node and drive in Chromium; `immersive-experiences.md` builds three full experiences on it.

## Contents

1. Technical contract: what was verified, what is stable, what is not
2. Time and update architecture
3. Resource ownership
4. The runtime
5. Driving GSAP from the loop
6. Framework integration rules
7. Tests
8. Limits

## 1. Technical contract (verified 2026-10-31, Three.js 0.186.1)

| Technology | Status | Verified locally |
|---|---|---|
| Three.js core (`three`), `WebGLRenderer`, GLSL `ShaderMaterial`, `EffectComposer` and the passes under `three/addons/postprocessing` (`RenderPass`, `UnrealBloomPass`, `BokehPass`, `FilmPass`, `ShaderPass`, `SMAAPass`, `OutputPass`) | Stable; WebGL 2 only since r163 | Present in `three@0.186.1`; compiled and rendered in headless Chromium (SwiftShader, WebGL 2.0 with `EXT_color_buffer_float`, `OES_texture_float_linear`, `WEBGL_lose_context`) |
| `GPUComputationRenderer` (`three/addons/misc`), float render targets, `MeshSurfaceSampler`, `InstancedMesh`, `InstancedBufferGeometry` | Stable | Present; the particle simulation of `gpu-particles.md` runs on them in the browser checks |
| `GLTFLoader`, `DRACOLoader`, `KTX2Loader`, `RoomEnvironment`, `PMREMGenerator` | Stable (Draco and KTX2 need their decoder files served from the app) | Present; the experiences use procedural geometry and `RoomEnvironment`, so no decoder is shipped here |
| `three/webgpu` (`WebGPURenderer`, node materials, `PostProcessing`) and `three/tsl` | Shipped as separate entry points; the API is still evolving release to release; `WebGPURenderer` falls back to a WebGL 2 backend when WebGPU is missing or `forceWebGL: true` | Importable (635 and 682 exports); TSL materials compile on the WebGL 2 backend in the browser checks. **Real WebGPU is not verified here**: the pinned headless Chromium exposes no `navigator.gpu` |
| WebGPU in browsers | Browser-dependent: feature-detect `navigator.gpu` and `requestAdapter()` at run time, never assume it from the user agent | Absent in the test browser |
| GSAP 3.15 + ScrollTrigger, `@gsap/react` 2.1 | Stable (`motion-engineering.md`) | Driven from the 3D loop below; tested in Node |
| React Three Fiber 9.8.2, TresJS core 5.9.3 | Stable for React 19 / Vue 3.5 | Compiled in the React and Nuxt projects; ownership rules in section 6 |
| Physics engines (Rapier, Cannon) | Optional; none is a dependency of this skill | Not installed: `interactive-3d.md` describes the integration seam only |

GLSL written for `WebGLRenderer` (`ShaderMaterial`, `onBeforeCompile`) does not run on `WebGPURenderer`, and TSL node materials do not run on `WebGLRenderer`. Pick one renderer per project; `shader-engineering.md` keeps the two libraries apart.

## 2. Time and update architecture

The failures of ambitious scenes are rarely in the shaders. They are two systems writing the same property (GSAP tweening `camera.position` while `OrbitControls` damps it), two clocks (a GSAP ticker and a `requestAnimationFrame` loop that drift), a simulation that integrates thirty seconds in one frame after a background tab, and render loops that nobody stops.

Rules:

- **One clock.** The runtime owns time. Every system reads `frame.delta` and `frame.elapsed` from it; nothing calls `performance.now()` or keeps its own `THREE.Clock`.
- **One ordered update.** Phases run in a fixed order every frame: `input` (pointer, scroll, keys are read), `state` (application state advances), `animation` (timelines and tweens write their targets), `simulation` (particles, physics), `camera` (rigs and controls settle the camera), `render`, `post`. A system in a later phase may read what an earlier one wrote; it never writes what an earlier phase owns.
- **One owner per property.** A system that animates `camera.position` claims it. A second claimant is a programming error surfaced at once, not a jitter found in QA.
- **Scroll or time, not both.** A sequence is driven either by scroll (`ScrollTrigger` scrub writes its progress) or by time (a timeline plays); the sequence exposes `seek(progress)` and does not care which. See `cinematic-motion.md`.
- **Delta is clamped.** The longest step accepted is 100 ms; the simulation slows down instead of exploding when the tab comes back.
- **Pause is a state, not a hack.** Hidden tab, canvas off screen, lost context and disposal each clear the running flag through one function.

```ts
// @verify creative:engine/update-loop.ts nuxt:lib/lab/engine/update-loop.ts next:lib/lab/engine/update-loop.ts
/**
 * One clock, one ordered update per frame. Systems register for a phase; the loop runs the phases in a fixed order,
 * so input is read before state changes, state before animation, animation before simulation, simulation before the
 * camera settles, and the camera before the render. A later phase may read what an earlier one wrote; it must not
 * write what an earlier phase owns. `claim()` makes that ownership explicit for the properties that matter.
 */
export const PHASES = ['input', 'state', 'animation', 'simulation', 'camera', 'render', 'post'] as const
export type Phase = (typeof PHASES)[number]

export interface Frame {
  /** seconds of scaled time since the loop started */
  elapsed: number
  /** seconds since the previous frame, scaled and clamped to maxDelta */
  delta: number
  /** unscaled wall-clock seconds since the loop started */
  wall: number
  /** 1 for the first frame */
  frame: number
}
export type System = (frame: Frame) => void

export interface UpdateLoopOptions {
  /** installs a repeating ticker that calls `tick(timeMs)` every frame (renderer.setAnimationLoop or requestAnimationFrame) */
  schedule?: (tick: (timeMs: number) => void) => void
  /** removes that ticker */
  unschedule?: () => void
  /** longest accepted delta in seconds; a tab that returns after 30 s must not simulate 30 s in one frame */
  maxDelta?: number
  /** a throwing system is reported and the frame continues; by default console.error */
  onError?: (error: unknown, system: string) => void
}

export interface UpdateLoop {
  /** registers a system for a phase; returns its removal */
  add(phase: Phase, system: System, name?: string): () => void
  /** declares `owner` as the only writer of `property` (e.g. 'camera.position'); a second owner throws */
  claim(property: string, owner: string): void
  release(property: string, owner: string): void
  owners(): ReadonlyMap<string, string>
  /** advances one frame at the given time in ms; the first call sets the origin and yields delta 0 */
  step(timeMs: number): Frame
  start(): void
  stop(): void
  readonly running: boolean
  readonly frame: number
  /** 1 = real time, 0 = frozen (reduced motion keeps the loop alive for interaction with timeScale 0) */
  timeScale: number
  systems(): { phase: Phase; name: string }[]
}

export class PropertyOwnershipError extends Error {
  constructor(property: string, owner: string, claimant: string) {
    super(`"${property}" is already driven by "${owner}"; "${claimant}" cannot write it too. Choose one driver or route one through the other.`)
    this.name = 'PropertyOwnershipError'
  }
}

function defaultScheduler(): Pick<Required<UpdateLoopOptions>, 'schedule' | 'unschedule'> {
  let id = 0
  return {
    schedule(tick) {
      const frame = (t: number) => {
        id = requestAnimationFrame(frame)
        tick(t)
      }
      id = requestAnimationFrame(frame)
    },
    unschedule() {
      cancelAnimationFrame(id)
    },
  }
}

export function createUpdateLoop(options: UpdateLoopOptions = {}): UpdateLoop {
  const scheduler = options.schedule && options.unschedule ? { schedule: options.schedule, unschedule: options.unschedule } : defaultScheduler()
  const maxDelta = options.maxDelta ?? 0.1
  const onError = options.onError ?? ((error: unknown, system: string) => console.error(`[update-loop] ${system} threw`, error))
  const registry = new Map<Phase, { fn: System; name: string }[]>(PHASES.map((p) => [p, []]))
  const owners = new Map<string, string>()
  let running = false
  let started = false
  let originMs = 0
  let lastMs = 0
  let elapsed = 0
  let frame = 0
  let timeScale = 1
  let anonymous = 0

  const step = (timeMs: number): Frame => {
    if (!started) {
      started = true
      originMs = timeMs
      lastMs = timeMs
    }
    const rawDelta = Math.min(Math.max((timeMs - lastMs) / 1000, 0), maxDelta)
    lastMs = timeMs
    const delta = rawDelta * timeScale
    elapsed += delta
    frame += 1
    const current: Frame = { elapsed, delta, wall: (timeMs - originMs) / 1000, frame }
    for (const phase of PHASES) {
      // copy: a system may remove itself or add another during the frame
      for (const { fn, name } of [...(registry.get(phase) ?? [])]) {
        try {
          fn(current)
        } catch (error) {
          onError(error, `${phase}:${name}`)
        }
      }
    }
    return current
  }

  return {
    add(phase, system, name) {
      const entry = { fn: system, name: name ?? `system-${++anonymous}` }
      const list = registry.get(phase)
      if (!list) throw new Error(`unknown phase ${String(phase)}`)
      list.push(entry)
      return () => {
        const i = list.indexOf(entry)
        if (i >= 0) list.splice(i, 1)
      }
    },
    claim(property, owner) {
      const current = owners.get(property)
      if (current && current !== owner) throw new PropertyOwnershipError(property, current, owner)
      owners.set(property, owner)
    },
    release(property, owner) {
      if (owners.get(property) === owner) owners.delete(property)
    },
    owners: () => owners,
    step,
    start() {
      if (running) return
      running = true
      scheduler.schedule((t) => {
        if (running) step(t)
      })
    },
    stop() {
      if (!running) return
      running = false
      scheduler.unschedule()
    },
    get running() {
      return running
    },
    get frame() {
      return frame
    },
    get timeScale() {
      return timeScale
    },
    set timeScale(value: number) {
      timeScale = Math.max(0, value)
    },
    systems: () => PHASES.flatMap((phase) => (registry.get(phase) ?? []).map(({ name }) => ({ phase, name }))),
  }
}
```

## 3. Resource ownership

Every geometry, material, texture, render target and renderer has exactly one of five owners, decided when it is created, not when something leaks:

| Ownership | Who disposes | Examples |
|---|---|---|
| `own` | this runtime, on `dispose()` | geometry built for this scene, its materials, its render targets, the renderer |
| `shared` | the pool, when the last holder releases it | an environment map used by two scenes, a noise texture reused across routes |
| `framework` | React Three Fiber or TresJS, when the element unmounts | `<boxGeometry>`, `<meshStandardMaterial>`, anything created declaratively |
| `external` | whoever passed it in | a texture received as a prop, a loaded GLTF kept by an asset cache |
| `unknown` | nobody, until someone decides | the honest state of a resource found in a graph the runtime did not build |

The registry records the decision and disposes only `own` resources; the scene-graph disposer below skips what is registered as anything else. A rule that disposes "everything under the root" is correct only for graphs the runtime built alone, which is why the 1.3 `disposeObject` helper stays for that case and this one takes the registry.

```ts
// @verify creative:engine/resource-registry.ts nuxt:lib/lab/engine/resource-registry.ts next:lib/lab/engine/resource-registry.ts
/** Ownership of GPU resources, decided at creation. Only `own` resources are disposed by the registry. */
export type Ownership = 'own' | 'shared' | 'framework' | 'external' | 'unknown'
export const OWNERSHIPS: readonly Ownership[] = ['own', 'shared', 'framework', 'external', 'unknown']

export interface Disposable {
  dispose(): void
}
export interface ResourceEntry {
  resource: Disposable
  ownership: Ownership
  label: string
}
export interface DisposeResult {
  disposed: string[]
  kept: Record<Exclude<Ownership, 'own'>, string[]>
  errors: { label: string; error: unknown }[]
}

export interface ResourceRegistry {
  own<T extends Disposable>(resource: T, label?: string): T
  shared<T extends Disposable>(resource: T, label?: string): T
  framework<T extends Disposable>(resource: T, label?: string): T
  external<T extends Disposable>(resource: T, label?: string): T
  unknown<T extends Disposable>(resource: T, label?: string): T
  ownershipOf(resource: Disposable): Ownership | null
  labelOf(resource: Disposable): string | null
  forget(resource: Disposable): void
  counts(): Record<Ownership, number>
  entries(): readonly ResourceEntry[]
  /** disposes `own` resources newest first, isolating errors; idempotent */
  dispose(): DisposeResult
  readonly disposed: boolean
}

export function createResourceRegistry(): ResourceRegistry {
  const entries: ResourceEntry[] = []
  const index = new Map<Disposable, ResourceEntry>()
  let disposed = false
  let anonymous = 0
  const register = <T extends Disposable>(resource: T, ownership: Ownership, label?: string): T => {
    const existing = index.get(resource)
    if (existing) {
      existing.ownership = ownership
      if (label) existing.label = label
      return resource
    }
    const entry = { resource, ownership, label: label ?? `${ownership}-${++anonymous}` }
    entries.push(entry)
    index.set(resource, entry)
    if (disposed && ownership === 'own') resource.dispose()
    return resource
  }
  return {
    own: (r, label) => register(r, 'own', label),
    shared: (r, label) => register(r, 'shared', label),
    framework: (r, label) => register(r, 'framework', label),
    external: (r, label) => register(r, 'external', label),
    unknown: (r, label) => register(r, 'unknown', label),
    ownershipOf: (r) => index.get(r)?.ownership ?? null,
    labelOf: (r) => index.get(r)?.label ?? null,
    forget(r) {
      const entry = index.get(r)
      if (!entry) return
      index.delete(r)
      entries.splice(entries.indexOf(entry), 1)
    },
    counts() {
      const counts = { own: 0, shared: 0, framework: 0, external: 0, unknown: 0 }
      for (const e of entries) counts[e.ownership]++
      return counts
    },
    entries: () => entries,
    dispose() {
      const result: DisposeResult = { disposed: [], kept: { shared: [], framework: [], external: [], unknown: [] }, errors: [] }
      if (disposed) return result
      disposed = true
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i]
        if (!entry) continue
        if (entry.ownership !== 'own') {
          result.kept[entry.ownership].push(entry.label)
          continue
        }
        try {
          entry.resource.dispose()
          result.disposed.push(entry.label)
        } catch (error) {
          result.errors.push({ label: entry.label, error })
        }
      }
      return result
    },
    get disposed() {
      return disposed
    },
  }
}

/** Reference-counted sharing: the resource is created once and disposed when the last holder releases it. */
export interface SharedPool {
  retain<T extends Disposable>(key: string, create: () => T): T
  release(key: string): boolean
  holders(key: string): number
  readonly size: number
}

export function createSharedPool(): SharedPool {
  const pool = new Map<string, { resource: Disposable; holders: number }>()
  return {
    retain(key, create) {
      const existing = pool.get(key)
      if (existing) {
        existing.holders++
        return existing.resource as ReturnType<typeof create>
      }
      const resource = create()
      pool.set(key, { resource, holders: 1 })
      return resource
    },
    release(key) {
      const entry = pool.get(key)
      if (!entry) return false
      entry.holders--
      if (entry.holders > 0) return false
      pool.delete(key)
      entry.resource.dispose()
      return true
    },
    holders: (key) => pool.get(key)?.holders ?? 0,
    get size() {
      return pool.size
    },
  }
}
```

```ts
// @verify creative:engine/dispose-graph.ts nuxt:lib/lab/engine/dispose-graph.ts next:lib/lab/engine/dispose-graph.ts
import * as THREE from 'three'
import type { ResourceRegistry } from './resource-registry'

export interface GraphDisposal {
  geometries: number
  materials: number
  textures: number
  kept: string[]
}

/**
 * Disposes the geometries, materials and textures under `root` that the registry does not mark as shared, framework,
 * external or unknown. Unregistered resources count as the runtime's own: register what you borrow.
 */
export function disposeSceneGraph(root: THREE.Object3D, registry?: ResourceRegistry): GraphDisposal {
  const result: GraphDisposal = { geometries: 0, materials: 0, textures: 0, kept: [] }
  const done = new Set<object>()
  const mine = (resource: { dispose(): void }, fallbackLabel: string) => {
    const ownership = registry?.ownershipOf(resource) ?? 'own'
    if (ownership === 'own') return true
    result.kept.push(`${registry?.labelOf(resource) ?? fallbackLabel}:${ownership}`)
    return false
  }
  root.traverse((object) => {
    const mesh = object as THREE.Mesh | THREE.Points | THREE.Line
    const geometry = (mesh as { geometry?: THREE.BufferGeometry }).geometry
    if (geometry && !done.has(geometry)) {
      done.add(geometry)
      if (mine(geometry, geometry.name || geometry.type)) {
        geometry.dispose()
        result.geometries++
      }
    }
    const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material
    const materials = Array.isArray(material) ? material : material ? [material] : []
    for (const m of materials) {
      if (done.has(m)) continue
      done.add(m)
      for (const value of Object.values(m)) {
        if (value instanceof THREE.Texture && !done.has(value)) {
          done.add(value)
          if (mine(value, value.name || 'texture')) {
            value.dispose()
            result.textures++
          }
        }
      }
      if (mine(m, m.name || m.type)) {
        m.dispose()
        result.materials++
      }
    }
  })
  return result
}
```

## 4. The runtime

The runtime is the browser glue: renderer with a clamped pixel ratio and explicit colour management, the loop scheduled through `renderer.setAnimationLoop` (one scheduler, the one the renderer already has), resize from a `ResizeObserver` on the canvas, pause when the document is hidden or the canvas leaves the viewport, a lost context that stops the loop and a restored one that resumes it, and a `dispose()` that stops, disconnects, disposes what it owns and releases the context. Its diagnostics are what the browser checks read: frames rendered, running flag, pause reasons, context events, `renderer.info` counts.

```ts
// @verify creative:engine/scene-runtime.ts nuxt:lib/lab/engine/scene-runtime.ts next:lib/lab/engine/scene-runtime.ts
import * as THREE from 'three'
import { createUpdateLoop, type Frame, type UpdateLoop } from './update-loop'
import { createResourceRegistry, type DisposeResult, type ResourceRegistry } from './resource-registry'
import { disposeSceneGraph, type GraphDisposal } from './dispose-graph'

export interface SceneRuntimeOptions {
  canvas: HTMLCanvasElement
  /** device pixel ratio ceiling; 2 is the usual budget, 1.5 for heavy post-processing */
  maxPixelRatio?: number
  antialias?: boolean
  alpha?: boolean
  powerPreference?: 'high-performance' | 'low-power' | 'default'
  toneMapping?: THREE.ToneMapping
  exposure?: number
  /** pause the loop while document.hidden (default true) */
  pauseWhenHidden?: boolean
  /** pause the loop while the canvas is out of the viewport (default true) */
  pauseWhenOffscreen?: boolean
  /** after dispose, force the context loss so the GPU memory is released now, not at garbage collection (default true) */
  releaseContextOnDispose?: boolean
  onContextLost?: () => void
  onContextRestored?: () => void
  onError?: (error: unknown, where: string) => void
}

export interface RuntimeDiagnostics {
  frames: number
  running: boolean
  started: boolean
  paused: { hidden: boolean; offscreen: boolean; contextLost: boolean }
  contextLost: number
  contextRestored: number
  disposed: boolean
  pixelRatio: number
  size: { width: number; height: number }
  lastDelta: number
  info: { geometries: number; textures: number; programs: number; calls: number; triangles: number; points: number; lines: number }
}

/** What dispose() freed, with renderer.info.memory at each step: the evidence a page or a test reads. */
export interface DisposalReport {
  before: { geometries: number; textures: number }
  afterGraph: { geometries: number; textures: number }
  afterRegistry: { geometries: number; textures: number }
  graph: GraphDisposal
  registry: DisposeResult
}

export interface SceneRuntime {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly loop: UpdateLoop
  readonly registry: ResourceRegistry
  /** replaces the default `renderer.render(scene, camera)` (an EffectComposer, a multi-pass pipeline) */
  setRender(render: (frame: Frame) => void): void
  /** called after every resize with the drawing-buffer size in CSS pixels */
  onResize(listener: (width: number, height: number) => void): () => void
  start(): void
  stop(): void
  /** stops, disconnects, disposes the graph and the registry, releases the context; null when already disposed */
  dispose(): DisposalReport | null
  stats(): RuntimeDiagnostics
  readonly disposed: boolean
}

export function createSceneRuntime(options: SceneRuntimeOptions): SceneRuntime {
  const { canvas } = options
  const onError = options.onError ?? ((error: unknown, where: string) => console.error(`[scene-runtime] ${where}`, error))
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: options.antialias ?? true, alpha: options.alpha ?? false, powerPreference: options.powerPreference ?? 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxPixelRatio ?? 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = options.toneMapping ?? THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = options.exposure ?? 1
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
  camera.position.set(0, 0, 6)
  const registry = createResourceRegistry()
  registry.own(renderer, 'renderer')
  const loop = createUpdateLoop({ schedule: (tick) => renderer.setAnimationLoop(tick), unschedule: () => renderer.setAnimationLoop(null), onError })

  let render: (frame: Frame) => void = () => renderer.render(scene, camera)
  let frames = 0
  let lastDelta = 0
  loop.add(
    'render',
    (frame) => {
      render(frame)
      frames++
      lastDelta = frame.delta
    },
    'runtime-render',
  )

  const state = { started: false, hidden: false, offscreen: false, contextLost: false, disposed: false, lost: 0, restored: 0 }
  const apply = () => {
    const shouldRun = state.started && !state.hidden && !state.offscreen && !state.contextLost && !state.disposed
    if (shouldRun && !loop.running) loop.start()
    else if (!shouldRun && loop.running) loop.stop()
  }

  const resizeListeners = new Set<(w: number, h: number) => void>()
  let size = { width: 0, height: 0 }
  const resize = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (!width || !height) return
    size = { width, height }
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    for (const l of resizeListeners) l(width, height)
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  resize()

  const onVisibility = () => {
    state.hidden = (options.pauseWhenHidden ?? true) && document.hidden
    apply()
  }
  document.addEventListener('visibilitychange', onVisibility)
  const intersection = options.pauseWhenOffscreen ?? true ? new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1]
    if (!entry) return
    state.offscreen = !entry.isIntersecting
    apply()
  }) : null
  intersection?.observe(canvas)

  const onLost = (event: Event) => {
    event.preventDefault() // tells the browser we will handle restoration
    state.contextLost = true
    state.lost++
    apply()
    options.onContextLost?.()
  }
  const onRestored = () => {
    state.contextLost = false
    state.restored++
    options.onContextRestored?.()
    apply()
  }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  return {
    renderer,
    scene,
    camera,
    loop,
    registry,
    setRender(fn) {
      render = fn
    },
    onResize(listener) {
      resizeListeners.add(listener)
      listener(size.width, size.height)
      return () => resizeListeners.delete(listener)
    },
    start() {
      state.started = true
      apply()
    },
    stop() {
      state.started = false
      apply()
    },
    dispose() {
      if (state.disposed) return null
      state.disposed = true
      state.started = false
      apply()
      resizeObserver.disconnect()
      intersection?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      const memory = () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures })
      const before = memory()
      const graph = disposeSceneGraph(scene, registry)
      scene.clear()
      const afterGraph = memory()
      const result = registry.dispose() // includes renderer.dispose()
      const afterRegistry = memory()
      if (options.releaseContextOnDispose ?? true) renderer.forceContextLoss()
      return { before, afterGraph, afterRegistry, graph, registry: result }
    },
    stats() {
      const { memory, render: r, programs } = renderer.info
      return {
        frames,
        running: loop.running,
        started: state.started,
        paused: { hidden: state.hidden, offscreen: state.offscreen, contextLost: state.contextLost },
        contextLost: state.lost,
        contextRestored: state.restored,
        disposed: state.disposed,
        pixelRatio: renderer.getPixelRatio(),
        size,
        lastDelta,
        info: { geometries: memory.geometries, textures: memory.textures, programs: programs?.length ?? 0, calls: r.calls, triangles: r.triangles, points: r.points, lines: r.lines },
      }
    },
    get disposed() {
      return state.disposed
    },
  }
}
```

What the runtime deliberately does not do: it does not load assets (that is an asset cache with `shared` ownership), it does not decide quality tiers (`rendering-quality.md`), and it does not know about scroll or GSAP (next section).

## 5. Driving GSAP from the loop

GSAP has its own ticker. Left alone, GSAP writes `camera.position` on its `requestAnimationFrame` and the runtime renders on `setAnimationLoop`: two clocks that run at the same rate most of the time and visibly drift when they do not. The documented way to have one clock is to remove GSAP's root update from its ticker and call it from the `animation` phase with the loop's time. Time continues from the ticker's current time so tweens created before the hand-over keep their schedule.

```ts
// @verify creative:engine/gsap-clock.ts nuxt:lib/lab/engine/gsap-clock.ts next:lib/lab/engine/gsap-clock.ts
import type { UpdateLoop } from './update-loop'

/** The parts of the gsap object this helper touches, so the test can drive the real gsap and a stub alike. */
export type TickerCallback = (time: number, deltaTime: number, frame: number, elapsed: number) => void
export interface GsapClockHost {
  ticker: { time: number; add(callback: TickerCallback): unknown; remove(callback: TickerCallback): unknown; lagSmoothing(threshold: number, adjustedLag?: number): unknown }
  globalTimeline: { time(): number }
  updateRoot(time: number): void
}

/**
 * Makes the update loop the only clock GSAP sees. Returns a restore function that hands time back to GSAP's ticker.
 * Call it once per runtime; a second runtime on the page must not steal the root update (keep one loop per page, or
 * share the loop).
 */
export function driveGsapFromLoop(loop: UpdateLoop, gsap: GsapClockHost): () => void {
  const update = gsap.updateRoot as unknown as TickerCallback
  gsap.ticker.remove(update)
  gsap.ticker.lagSmoothing(0)
  // continue from wherever GSAP's time is now (the ticker's clock, or the root timeline if a previous loop drove it
  // further), so tweens created before the hand-over keep their schedule and time never runs backwards
  const base = Math.max(gsap.ticker.time, gsap.globalTimeline.time())
  const remove = loop.add('animation', (frame) => gsap.updateRoot(base + frame.elapsed), 'gsap-root')
  return () => {
    remove()
    gsap.ticker.add(update)
  }
}
```

Scroll-driven sequences do not need the ticker at all: `ScrollTrigger` with `scrub` writes progress into the timeline when the scroll position changes, and the runtime reads the state the timeline left. The rule from `motion-engineering.md` still holds: one `gsap.context()` or `gsap.matchMedia()` per mounted experience, reverted on unmount, and the reduced-motion branch decides between a scrubbed sequence and instant final states.

## 6. Framework integration rules

| Framework | Create | Dispose | Ownership of declarative objects |
|---|---|---|---|
| Vue / Nuxt, imperative Three.js | `onMounted` (never at the top level of `<script setup>`, which runs during SSR) | `onBeforeUnmount` → `runtime.dispose()` | all `own` |
| TresJS | `<TresCanvas>` creates the renderer; `useLoop().onBeforeRender` is the frame callback | TresJS disposes what its components created when they unmount | `<TresMesh>`, `<TresBoxGeometry>` and friends are `framework`; a `<primitive :object>` is yours (`own` or `external`) |
| React / Next, imperative Three.js | `useEffect` with an empty dependency list, inside a `'use client'` component; dynamic import with `ssr: false` for heavy modules | the effect's cleanup → `runtime.dispose()`; Strict Mode mounts, unmounts and mounts again, so create and dispose must both be complete and cheap | all `own` |
| React Three Fiber | `<Canvas>` creates the renderer; `useFrame` is the frame callback (R3F's loop is the clock: do not start a second one) | R3F disposes declarative objects on unmount unless `dispose={null}` | JSX elements are `framework`; `<primitive object>` is yours; textures from `useLoader` are cached by R3F (`shared`) |

Rules that apply everywhere:

- The canvas is created by the framework template and handed to the runtime; the runtime never creates DOM.
- A route change is an unmount: the loop stops, the context is released, `renderer.info.memory` goes back to zero. Re-entering the route creates a new runtime; counts equal the first visit.
- `prefers-reduced-motion: reduce` keeps the scene interactive and still: `loop.timeScale = 0` plus a sequence seeked to its final state, never a blank canvas.
- `<ClientOnly>` / `ssr: false` guard the module import when it touches `window` at module scope (shader libraries do not; `WebGLRenderer` construction does).

## 7. Tests

The loop, the registry, the pool and the GSAP clock are plain TypeScript and run in Node. The scene-graph disposer runs against real Three.js objects (no renderer needed). The runtime itself is exercised in Chromium by the lab pages of `immersive-experiences.md`.

```ts
// @verify creative:engine/update-loop.test.ts
import { describe, expect, it } from 'vitest'
import { PHASES, PropertyOwnershipError, createUpdateLoop } from './update-loop'

describe('update loop', () => {
  it('runs the phases in order every frame and gives systems one shared frame', () => {
    const loop = createUpdateLoop({ schedule: () => {}, unschedule: () => {} })
    const order: string[] = []
    for (const phase of [...PHASES].reverse()) loop.add(phase, () => order.push(phase), phase)
    loop.step(0)
    loop.step(16)
    expect(order).toEqual([...PHASES, ...PHASES])
    expect(loop.frame).toBe(2)
  })

  it('clamps the delta and scales time; the first frame has delta 0', () => {
    const loop = createUpdateLoop({ schedule: () => {}, unschedule: () => {}, maxDelta: 0.1 })
    const deltas: number[] = []
    const elapsed: number[] = []
    loop.add('state', (f) => {
      deltas.push(f.delta)
      elapsed.push(f.elapsed)
    })
    loop.step(1000)
    loop.step(1016)
    loop.step(31016) // a tab that came back after 30 s
    loop.timeScale = 0.5
    loop.step(31116)
    loop.timeScale = 0
    loop.step(31216)
    expect(deltas.map((d) => Number(d.toFixed(3)))).toEqual([0, 0.016, 0.1, 0.05, 0])
    expect(elapsed.at(-1)).toBeCloseTo(0.166, 3)
  })

  it('surfaces two drivers of one property as an error and lets a system remove itself', () => {
    const loop = createUpdateLoop({ schedule: () => {}, unschedule: () => {} })
    loop.claim('camera.position', 'shot-sequence')
    loop.claim('camera.position', 'shot-sequence') // same owner again is fine
    expect(() => loop.claim('camera.position', 'orbit-controls')).toThrow(PropertyOwnershipError)
    loop.release('camera.position', 'shot-sequence')
    expect(() => loop.claim('camera.position', 'orbit-controls')).not.toThrow()
    let runs = 0
    const remove = loop.add('animation', () => {
      runs++
      remove()
    })
    loop.step(0)
    loop.step(16)
    expect(runs).toBe(1)
    expect(loop.systems()).toEqual([])
  })

  it('reports a throwing system and keeps the frame going', () => {
    const errors: string[] = []
    const loop = createUpdateLoop({ schedule: () => {}, unschedule: () => {}, onError: (_e, where) => errors.push(where) })
    const seen: string[] = []
    loop.add('state', () => {
      throw new Error('boom')
    }, 'broken')
    loop.add('render', () => seen.push('render'))
    loop.step(0)
    expect(errors).toEqual(['state:broken'])
    expect(seen).toEqual(['render'])
  })

  it('start installs the scheduler once and stop removes it', () => {
    let installed = 0
    let removed = 0
    const held: { tick?: (t: number) => void } = {}
    const loop = createUpdateLoop({ schedule: (t) => { installed++; held.tick = t }, unschedule: () => { removed++ } })
    loop.start()
    loop.start()
    held.tick?.(0)
    held.tick?.(16)
    expect(installed).toBe(1)
    expect(loop.frame).toBe(2)
    loop.stop()
    held.tick?.(32) // a late tick after stop does nothing
    expect(removed).toBe(1)
    expect(loop.frame).toBe(2)
    expect(loop.running).toBe(false)
  })
})
```

```ts
// @verify creative:engine/resource-registry.test.ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createResourceRegistry, createSharedPool } from './resource-registry'
import { disposeSceneGraph } from './dispose-graph'

const disposable = (log: string[], name: string) => ({ dispose: () => log.push(name) })

describe('resource registry', () => {
  it('disposes own resources newest first and keeps the rest, by ownership', () => {
    const log: string[] = []
    const registry = createResourceRegistry()
    registry.own(disposable(log, 'geometry'), 'geometry')
    registry.shared(disposable(log, 'envmap'), 'envmap')
    registry.framework(disposable(log, 'jsx-material'), 'jsx-material')
    registry.external(disposable(log, 'prop-texture'), 'prop-texture')
    registry.unknown(disposable(log, 'found-in-graph'), 'found-in-graph')
    registry.own(disposable(log, 'material'), 'material')
    expect(registry.counts()).toEqual({ own: 2, shared: 1, framework: 1, external: 1, unknown: 1 })
    const result = registry.dispose()
    expect(log).toEqual(['material', 'geometry'])
    expect(result.disposed).toEqual(['material', 'geometry'])
    expect(result.kept).toEqual({ shared: ['envmap'], framework: ['jsx-material'], external: ['prop-texture'], unknown: ['found-in-graph'] })
    expect(registry.dispose().disposed).toEqual([]) // idempotent
    // registering an own resource after disposal disposes it at once instead of leaking it
    registry.own(disposable(log, 'late'))
    expect(log.at(-1)).toBe('late')
  })

  it('isolates a throwing dispose', () => {
    const log: string[] = []
    const registry = createResourceRegistry()
    registry.own(disposable(log, 'first'), 'first')
    registry.own({ dispose: () => { throw new Error('gpu gone') } }, 'broken')
    const result = registry.dispose()
    expect(result.errors.map((e) => e.label)).toEqual(['broken'])
    expect(log).toEqual(['first'])
  })

  it('shares a resource by reference count and disposes it with the last release', () => {
    const log: string[] = []
    const pool = createSharedPool()
    let created = 0
    const make = () => { created++; return disposable(log, 'env') }
    const a = pool.retain('env', make)
    const b = pool.retain('env', make)
    expect(a).toBe(b)
    expect(created).toBe(1)
    expect(pool.holders('env')).toBe(2)
    expect(pool.release('env')).toBe(false)
    expect(log).toEqual([])
    expect(pool.release('env')).toBe(true)
    expect(log).toEqual(['env'])
    expect(pool.size).toBe(0)
    expect(pool.release('env')).toBe(false)
  })
})

describe('disposeSceneGraph', () => {
  it('disposes own geometries, materials and textures once and keeps what the registry marks otherwise', () => {
    const registry = createResourceRegistry()
    const scene = new THREE.Scene()
    const sharedEnv = registry.shared(new THREE.Texture(), 'envmap')
    const ownMap = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial({ map: ownMap, envMap: sharedEnv })
    const geometry = new THREE.BoxGeometry()
    scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material)) // the same resources twice
    const propMaterial = registry.external(new THREE.MeshBasicMaterial(), 'prop-material')
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), propMaterial))
    const disposed: string[] = []
    for (const [name, target] of [['geometry', geometry], ['material', material], ['ownMap', ownMap], ['sharedEnv', sharedEnv], ['propMaterial', propMaterial]] as const) {
      target.addEventListener('dispose', () => disposed.push(name))
    }
    const result = disposeSceneGraph(scene, registry)
    expect(disposed.sort()).toEqual(['geometry', 'material', 'ownMap'])
    expect(result).toMatchObject({ geometries: 2, materials: 1, textures: 1 })
    expect(result.kept).toEqual(['envmap:shared', 'prop-material:external'])
  })
})
```

```ts
// @verify creative:engine/gsap-clock.test.ts
import gsap from 'gsap'
import { afterEach, describe, expect, it } from 'vitest'
import { createUpdateLoop } from './update-loop'
import { driveGsapFromLoop } from './gsap-clock'

afterEach(() => {
  gsap.globalTimeline.clear()
})

describe('driveGsapFromLoop', () => {
  // maxDelta is raised so the coarse steps below are not clamped (the clamp has its own test in update-loop.test.ts)
  const options = { schedule: () => {}, unschedule: () => {}, maxDelta: 10 }

  it('advances tweens only when the loop steps, from the ticker time onwards, and hands the clock back', () => {
    const loop = createUpdateLoop(options)
    const restore = driveGsapFromLoop(loop, gsap)
    const target = { x: 0 }
    gsap.to(target, { x: 100, duration: 1, ease: 'none' })
    loop.step(0)
    expect(target.x).toBe(0)
    loop.step(500)
    expect(target.x).toBeCloseTo(50, 0)
    loop.timeScale = 0 // reduced motion: the loop keeps running, GSAP time stands still
    loop.step(800)
    expect(target.x).toBeCloseTo(50, 0)
    loop.timeScale = 1
    loop.step(1300)
    expect(target.x).toBe(100)
    expect(loop.systems()).toEqual([{ phase: 'animation', name: 'gsap-root' }])
    restore()
    expect(loop.systems()).toEqual([])
  })

  it('a second runtime after the first was restored starts tweens at once (time never goes backwards)', () => {
    const first = createUpdateLoop(options)
    const restoreFirst = driveGsapFromLoop(first, gsap)
    first.step(0)
    first.step(2000)
    restoreFirst()
    const second = createUpdateLoop(options)
    const restoreSecond = driveGsapFromLoop(second, gsap)
    const target = { x: 0 }
    gsap.to(target, { x: 1, duration: 1, ease: 'none' })
    second.step(0)
    second.step(250)
    expect(target.x).toBeCloseTo(0.25, 1)
    restoreSecond()
  })
})
```

## 8. Limits

- The loop orders systems; it cannot know that a system in `camera` writes a material uniform. `claim()` is a convention the code must follow; the `three-competing-animation-drivers` rule of `leak-patterns` finds the obvious case in a file (a GSAP tween and a frame callback writing the same path).
- `IntersectionObserver` pauses the loop when the canvas leaves the viewport; a canvas behind an opaque overlay is still "visible" to it.
- `renderer.forceContextLoss()` after dispose frees the GPU memory immediately and fires `webglcontextlost` on the old canvas; the runtime removes its listeners first. Frameworks that reuse the canvas element across mounts (Vue `<KeepAlive>`) must not release the context; pass `releaseContextOnDispose: false` there.
- Real WebGPU behaviour (adapter limits, timestamp queries, compute passes) is not verified by this repository's browser; see `shader-engineering.md` for what the WebGL 2 backend proves about TSL and what it does not.
