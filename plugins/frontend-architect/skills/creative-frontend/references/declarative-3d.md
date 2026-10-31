# Declarative 3D: the same experience in React Three Fiber and TresJS

One product experience (the atelier speaker from `asset-pipeline.md`: a GLTF with six parts, a clip and a morph target) built twice on the frameworks' own mechanisms: React Three Fiber in Next.js and TresJS in Nuxt. What is shared is the domain (parts, exploded offsets, the GSAP timeline that explodes and reassembles, the hover/select state, the asset cache); what is adapted per framework is thin: how the model suspends, how events reach a part, how the frame callback runs, how the lifecycle disposes. Nothing of the imperative runtime is copied into the components; the frameworks already own the renderer, the loop and the scene graph.

## Contents

1. What is shared and what is adapted
2. The shared domain: parts, explode timeline, selection state
3. React Three Fiber in Next.js
4. TresJS in Nuxt
5. What the browser checks prove
6. Measured: where the line between shared and specific lands

## 1. What is shared and what is adapted

| Concern | Shared module | React Three Fiber | TresJS |
|---|---|---|---|
| Model loading, caching, sharing, release | `assets/asset-cache.ts`, `assets/loaders.ts` | `useAsset(url)` suspends with React 19 `use()` on a record per cache and URL; the provider owns the cache and disposes it with the Canvas | an async component awaits `cache.load()` under a `<Suspense>` inside the TresCanvas; the scene component provides the cache and disposes it on unmount |
| Renderer, loop, scene graph | none: the framework's | `<Canvas>`, `useFrame`, `useThree` | `<TresCanvas>`, `useLoop().onBeforeRender`, `useTres()` |
| Exploded view | `buildExplodeTimeline()` (GSAP) | `useGSAP` owns the timeline and reverts it | `gsap.context()` in `onMounted`, reverted in `onBeforeUnmount` |
| Hover and selection | `createPartsState()`, `applyHighlight()` | `onPointerOver/Out/Click` on `<primitive>` (events bubble from the part meshes) | `@pointermove` and `@click` on `<primitive>` (TresJS 5 delivers them for the mesh under the pointer), `@pointermissed` on the canvas to clear the hover |
| Colour, environment, lights | `rendering/color.ts`, `rendering/environment.ts` | applied in `onCreated` / a component with `useThree` | applied in a component with `useTres()` |
| Reduced motion | the page decides once | prop | prop |
| Diagnostics for the checks | the same `window.__lab` shape | a bridge component inside the Canvas | the scene component |

## 2. The shared domain: parts, explode timeline, selection state

```ts
// @verify creative:experiences/atelier-parts.ts nuxt:lib/lab/experiences/atelier-parts.ts next:lib/lab/experiences/atelier-parts.ts
import * as THREE from 'three'

export const ATELIER_PARTS = ['base', 'body', 'grille', 'cap', 'knob', 'label'] as const
export type AtelierPart = (typeof ATELIER_PARTS)[number]
export const PART_LABELS: Record<AtelierPart, string> = { base: 'Rubber base', body: 'Painted body', grille: 'Woven grille', cap: 'Top plate', knob: 'Brass knob', label: 'Label' }
/** local-space displacement of each part in the exploded view (the knob is a child of the cap, the label of the body) */
export const EXPLODE_OFFSETS: Record<AtelierPart, [number, number, number]> = { base: [0, -0.38, 0], body: [0, 0, 0], grille: [0, 0, 0.6], cap: [0, 0.65, 0], knob: [0.22, 0.32, 0], label: [0, -0.08, 0.42] }
export const HIGHLIGHT = { hover: '#ffd27a', selected: '#5ee7ff' } as const

export type PartsMap = Map<string, THREE.Object3D>
export type Pose = Record<string, [number, number, number]>

export function capturePose(parts: PartsMap): Pose {
  const pose: Pose = {}
  for (const [name, object] of parts) pose[name] = [object.position.x, object.position.y, object.position.z]
  return pose
}

export interface TimelineLike {
  to(target: object, vars: object, position?: string | number): TimelineLike
  progress(value?: number): unknown
  play(): unknown
  reverse(): unknown
  kill(): void
  duration(): number
}

/**
 * A paused GSAP timeline that moves every part from its assembled pose to assembled + offset, bottom to top with a
 * small stagger. progress(1) is the exploded view, progress(0) the product; reversing plays the reassembly.
 */
export function buildExplodeTimeline(gsap: { timeline(vars?: object): TimelineLike }, parts: PartsMap, options: { duration?: number; stagger?: number } = {}): TimelineLike {
  const duration = options.duration ?? 0.9
  const stagger = options.stagger ?? 0.06
  const pose = capturePose(parts)
  const tl = gsap.timeline({ paused: true })
  const order: AtelierPart[] = ['base', 'label', 'grille', 'cap', 'knob']
  order.forEach((name, i) => {
    const object = parts.get(name)
    const start = pose[name]
    if (!object || !start) return
    const [dx, dy, dz] = EXPLODE_OFFSETS[name]
    tl.to(object.position, { x: start[0] + dx, y: start[1] + dy, z: start[2] + dz, duration, ease: 'power3.inOut' }, i * stagger)
  })
  return tl
}

export type HighlightState = 'none' | 'hover' | 'selected'
/** Writes the highlight into the part's own material (instantiate with ownMaterials: true); only emissive changes. */
export function applyHighlight(mesh: THREE.Mesh, state: HighlightState): void {
  const material = mesh.material as THREE.MeshStandardMaterial
  if (!('emissive' in material)) return
  if (state === 'none') {
    material.emissive.set(0x000000)
    material.emissiveIntensity = 1
  } else {
    material.emissive.set(state === 'hover' ? HIGHLIGHT.hover : HIGHLIGHT.selected)
    material.emissiveIntensity = state === 'hover' ? 0.35 : 0.6
  }
}

export interface PartsState {
  readonly hovered: AtelierPart | null
  readonly selected: AtelierPart | null
  hover(part: AtelierPart | null): void
  select(part: AtelierPart | null): void
  /** the highlight a part should show now */
  stateOf(part: AtelierPart): HighlightState
  subscribe(listener: (state: { hovered: AtelierPart | null; selected: AtelierPart | null }) => void): () => void
}

export const isAtelierPart = (name: string): name is AtelierPart => (ATELIER_PARTS as readonly string[]).includes(name)

export function createPartsState(): PartsState {
  let hovered: AtelierPart | null = null
  let selected: AtelierPart | null = null
  const listeners = new Set<(s: { hovered: AtelierPart | null; selected: AtelierPart | null }) => void>()
  const emit = () => { for (const l of listeners) l({ hovered, selected }) }
  return {
    get hovered() { return hovered },
    get selected() { return selected },
    hover(part) { if (part === hovered) return; hovered = part; emit() },
    select(part) { selected = part === selected ? null : part; emit() },
    stateOf: (part) => (part === selected ? 'selected' : part === hovered ? 'hover' : 'none'),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
}
```

```ts
// @verify creative:experiences/atelier-parts.test.ts
import gsap from 'gsap'
import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { EXPLODE_OFFSETS, applyHighlight, buildExplodeTimeline, capturePose, createPartsState } from './atelier-parts'

afterEach(() => {
  gsap.globalTimeline.clear()
})

function rig() {
  const parts = new Map<string, THREE.Object3D>()
  const cap = new THREE.Object3D()
  cap.position.set(0, 1.27, 0)
  const knob = new THREE.Object3D()
  knob.position.set(0.35, 0.12, 0)
  cap.add(knob)
  const entries: [string, THREE.Object3D, [number, number, number] | null][] = [['base', new THREE.Object3D(), [0, 0.06, 0]], ['body', new THREE.Object3D(), [0, 0.67, 0]], ['grille', new THREE.Object3D(), [0, 0.62, 0]], ['cap', cap, null], ['knob', knob, null], ['label', new THREE.Object3D(), [0, -0.2, 0.605]]]
  for (const [name, object, position] of entries) {
    if (position) object.position.set(position[0], position[1], position[2])
    parts.set(name, object)
  }
  return parts
}

describe('atelier parts', () => {
  it('explodes along the offsets at progress 1 and restores the pose exactly at 0, in local space for nested parts', () => {
    const parts = rig()
    const before = capturePose(parts)
    const tl = buildExplodeTimeline(gsap, parts)
    expect(tl.duration()).toBeGreaterThan(0.9)
    tl.progress(1)
    for (const name of ['base', 'grille', 'cap', 'knob', 'label'] as const) {
      const [dx, dy, dz] = EXPLODE_OFFSETS[name]
      const p = parts.get(name)!.position
      expect([p.x, p.y, p.z].map((v) => Number(v.toFixed(5)))).toEqual([before[name]![0] + dx, before[name]![1] + dy, before[name]![2] + dz].map((v) => Number(v.toFixed(5))))
    }
    expect(parts.get('body')!.position.toArray()).toEqual([0, 0.67, 0]) // the body stays
    tl.progress(0.5)
    expect(parts.get('cap')!.position.y).toBeGreaterThan(before.cap![1])
    tl.progress(0)
    expect(capturePose(parts)).toEqual(before)
    tl.kill()
  })

  it('tracks hover and selection and maps them to a highlight that only touches emissive', () => {
    const state = createPartsState()
    const log: string[] = []
    state.subscribe((s) => log.push(`${s.hovered}/${s.selected}`))
    state.hover('cap')
    state.hover('cap')
    state.select('cap')
    state.hover(null)
    state.select('cap') // toggles off
    expect(log).toEqual(['cap/null', 'cap/cap', 'null/cap', 'null/null'])
    state.select('knob')
    state.hover('knob')
    expect(state.stateOf('knob')).toBe('selected')
    expect(state.stateOf('cap')).toBe('none')
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#336699' }))
    applyHighlight(mesh, 'hover')
    expect((mesh.material as THREE.MeshStandardMaterial).emissive.getHexString()).toBe('ffd27a')
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('336699')
    applyHighlight(mesh, 'none')
    expect((mesh.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0)
  })
})
```

## 3. React Three Fiber in Next.js

The Suspense bridge: a record per cache and URL holds the promise and the handle; `use(promise)` suspends the component until the model is parsed; mounted components count themselves on the record and the last one to unmount releases the handle after a short grace (Strict Mode mounts, unmounts and mounts again within it). The provider owns the cache and disposes it when the `<Canvas>` unmounts, which also covers a component abandoned while suspended.

```tsx
// @verify next:lib/lab/react/use-asset.tsx react:lib/r3f/use-asset.tsx
'use client'
import { createContext, use, useContext, useEffect, useMemo, type ReactNode } from 'react'

/** The part of the asset cache the bridge needs (structural, so a test can pass a stub). */
export interface HandleLike {
  release(): void
}
export interface CacheLike<H extends HandleLike = HandleLike> {
  load(url: string): Promise<H>
  dispose(): void
}
interface AssetRecord<H extends HandleLike> {
  promise: Promise<H>
  handle: H | null
  error: unknown
  refs: number
  timer: ReturnType<typeof setTimeout> | null
}
const records = new WeakMap<CacheLike, Map<string, AssetRecord<HandleLike>>>()
const RELEASE_GRACE_MS = 1000

const AssetCacheContext = createContext<CacheLike | null>(null)

/** Provides a cache created by the caller (inside the Canvas, where the renderer exists) and disposes it on unmount. */
export function AssetCacheProvider<H extends HandleLike>({ create, children }: { create: () => CacheLike<H>; children: ReactNode }) {
  const cache = useMemo(() => create(), [create])
  useEffect(() => () => {
    records.delete(cache)
    cache.dispose()
  }, [cache])
  return <AssetCacheContext.Provider value={cache as CacheLike}>{children}</AssetCacheContext.Provider>
}

/** Suspends until the model is loaded; the handle is released when the last component using it unmounts. */
export function useAssetFrom<H extends HandleLike>(cache: CacheLike<H>, url: string): H {
  let map = records.get(cache as CacheLike)
  if (!map) {
    map = new Map()
    records.set(cache as CacheLike, map)
  }
  let record = map.get(url) as AssetRecord<H> | undefined
  if (!record) {
    const created: AssetRecord<H> = { promise: null as unknown as Promise<H>, handle: null, error: null, refs: 0, timer: null }
    created.promise = cache.load(url).then(
      (handle) => {
        created.handle = handle
        return handle
      },
      (error: unknown) => {
        created.error = error
        throw error
      },
    )
    record = created
    map.set(url, created as AssetRecord<HandleLike>)
  }
  const handle = use(record.promise)
  const current = record
  const currentMap = map
  useEffect(() => {
    current.refs++
    if (current.timer) {
      clearTimeout(current.timer)
      current.timer = null
    }
    return () => {
      current.refs--
      if (current.refs > 0) return
      current.timer = setTimeout(() => {
        if (current.refs > 0) return
        current.handle?.release()
        if (currentMap.get(url) === (current as AssetRecord<HandleLike>)) currentMap.delete(url)
      }, RELEASE_GRACE_MS)
    }
  }, [current, currentMap, url])
  return handle
}

export function useAsset<H extends HandleLike>(url: string): H {
  const cache = useContext(AssetCacheContext)
  if (!cache) throw new Error('useAsset needs an AssetCacheProvider above it')
  return useAssetFrom(cache as CacheLike<H>, url)
}
```

```tsx
// @verify react:lib/r3f/use-asset.test.tsx
// @vitest-environment happy-dom
import { act } from 'react'
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAssetFrom, type CacheLike, type HandleLike } from './use-asset'

/** A stub cache with the handle discipline of the real one: holders per url, release counts. */
function stubCache() {
  const holders = new Map<string, number>()
  const log: string[] = []
  const cache: CacheLike<HandleLike & { url: string }> = {
    load: (url) => new Promise((resolve) => setTimeout(() => {
      holders.set(url, (holders.get(url) ?? 0) + 1)
      log.push(`load:${url}`)
      resolve({ url, release: () => { holders.set(url, (holders.get(url) ?? 1) - 1); log.push(`release:${url}`) } })
    }, 5)),
    dispose: () => log.push('dispose'),
  }
  return { cache, holders, log }
}

function Probe({ cache, url, seen }: { cache: CacheLike<HandleLike & { url: string }>; url: string; seen: string[] }) {
  const handle = useAssetFrom(cache, url)
  seen.push(handle.url)
  return <p data-loaded>{handle.url}</p>
}

describe('useAssetFrom under Strict Mode', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads once, mounts twice under Strict Mode without a second load or an early release, and releases after unmount', async () => {
    const { cache, holders, log } = stubCache()
    const seen: string[] = []
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <StrictMode>
          <Suspense fallback={<p data-fallback>loading</p>}>
            <Probe cache={cache} url="/models/a.glb" seen={seen} />
          </Suspense>
        </StrictMode>,
      )
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) }) // act drains the suspended load
    expect(container.querySelector('[data-loaded]')?.textContent).toBe('/models/a.glb')
    expect(log.filter((l) => l.startsWith('load:')).length).toBe(1)
    expect(holders.get('/models/a.glb')).toBe(1) // Strict Mode's extra mount/unmount did not release it
    vi.useFakeTimers()
    await act(async () => { root.unmount() })
    expect(holders.get('/models/a.glb')).toBe(1) // not yet: the grace period absorbs a quick remount
    await act(async () => { vi.advanceTimersByTime(1100) })
    expect(holders.get('/models/a.glb')).toBe(0)
    expect(log.at(-1)).toBe('release:/models/a.glb')
  })

  it('two components share one handle and the last unmount releases it', async () => {
    const { cache, holders } = stubCache()
    const container = document.createElement('div')
    const root = createRoot(container)
    const render = (count: number) => act(async () => {
      root.render(
        <Suspense fallback={null}>
          {Array.from({ length: count }, (_, i) => <Probe key={i} cache={cache} url="/models/b.glb" seen={[]} />)}
        </Suspense>,
      )
    })
    await render(2)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(container.querySelectorAll('[data-loaded]').length).toBe(2)
    expect(holders.get('/models/b.glb')).toBe(1)
    vi.useFakeTimers()
    await render(1)
    await act(async () => { vi.advanceTimersByTime(1100) })
    expect(holders.get('/models/b.glb')).toBe(1) // one component still mounted
    await render(0)
    await act(async () => { vi.advanceTimersByTime(1100) })
    expect(holders.get('/models/b.glb')).toBe(0)
  })
})
```

The experience: `<Canvas>` owns renderer and loop; the provider creates the cache with the Canvas's renderer (KTX2 needs it); `Speaker` suspends on the model, instantiates it with its own materials (highlights are per instance), binds the exploded-view timeline through `useGSAP`, and turns pointer events on the primitive into hover and selection by the part's name; `Turntable` is a `useFrame`; `LabBridge` publishes the diagnostics.

```tsx
// @verify next:features/atelier/AtelierR3F.tsx
'use client'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { createAssetCache, type ModelHandle, type ModelInstance } from '@/lib/lab/assets/asset-cache'
import { createLoaders } from '@/lib/lab/assets/loaders'
import { AssetCacheProvider, useAsset } from '@/lib/lab/react/use-asset'
import { applyHighlight, buildExplodeTimeline, createPartsState, isAtelierPart, type AtelierPart, type PartsState, type TimelineLike } from '@/lib/lab/experiences/atelier-parts'
import { applyColorPipeline, COLOR_PRESETS } from '@/lib/lab/rendering/color'
import { applyEnvironment, createStudioEnvironment } from '@/lib/lab/rendering/environment'
import { createResourceRegistry } from '@/lib/lab/engine/resource-registry'

gsap.registerPlugin(useGSAP)

export interface AtelierR3FProps {
  url?: string
  exploded: boolean
  reducedMotion: boolean
  onSelect?: (part: AtelierPart | null) => void
  /** receives the api the page and the checks drive */
  onApi?: (api: AtelierApi) => void
}
export interface AtelierApi {
  explode(on: boolean): void
  select(part: AtelierPart | null): void
  hover(part: AtelierPart | null): void
  screenPositionOf(part: AtelierPart): { x: number; y: number } | null
  diagnostics(): AtelierDiagnostics
}
export interface AtelierDiagnostics {
  loaded: boolean
  parts: string[]
  hovered: string | null
  selected: string | null
  exploded: boolean
  explodeProgress: number
  positions: Record<string, { x: number; y: number; z: number }>
  reducedMotion: boolean
  frames: number
  info: { geometries: number; textures: number; calls: number; triangles: number }
}

/** Studio light through the shared environment helper; the registry only holds the env target so it is released on unmount. */
function Studio() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    applyColorPipeline(gl, COLOR_PRESETS.product)
    const registry = createResourceRegistry()
    const environment = createStudioEnvironment(gl, registry)
    applyEnvironment(scene, environment.texture, { intensity: 0.9, rotationY: 0.4 })
    return () => {
      scene.environment = null
      environment.dispose()
      registry.dispose()
    }
  }, [gl, scene])
  return (
    <>
      <directionalLight position={[3, 5, 4]} intensity={2.2} color="#fff1dc" />
      <directionalLight position={[-4, 3, -5]} intensity={1} color="#dfe9ff" />
    </>
  )
}

function Speaker({ url, exploded, reducedMotion, state, onInstance }: { url: string; exploded: boolean; reducedMotion: boolean; state: PartsState; onInstance: (instance: ModelInstance | null, timeline: TimelineLike | null) => void }) {
  const handle = useAsset<ModelHandle>(url)
  const instance = useMemo(() => handle.instantiate({ ownMaterials: true }), [handle])
  useEffect(() => () => instance.dispose(), [instance])
  const group = useRef<THREE.Group>(null)
  const timeline = useRef<TimelineLike | null>(null)
  // the exploded-view timeline lives in the GSAP context of this component and is reverted with it
  useGSAP(() => {
    const parts = new Map<string, THREE.Object3D>(instance.parts)
    const tl = buildExplodeTimeline(gsap, parts, { duration: 0.9 })
    timeline.current = tl
    onInstance(instance, tl)
    return () => {
      tl.kill()
      timeline.current = null
      onInstance(null, null)
    }
  }, { dependencies: [instance] })
  useEffect(() => {
    const tl = timeline.current
    if (!tl) return
    if (reducedMotion) tl.progress(exploded ? 1 : 0)
    else if (exploded) tl.play()
    else tl.reverse()
  }, [exploded, reducedMotion, instance])
  useEffect(() => state.subscribe(() => { for (const [name, mesh] of instance.parts) if (isAtelierPart(name)) applyHighlight(mesh, state.stateOf(name)) }), [state, instance])
  const partOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => (isAtelierPart(e.object.name) ? e.object.name : null)
  return (
    <group ref={group}>
      <primitive
        object={instance.root}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); state.hover(partOf(e)) }}
        onPointerOut={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); state.hover(null) }}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); state.select(partOf(e)) }}
      />
    </group>
  )
}

function Turntable({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_state, delta) => {
    if (enabled && ref.current) ref.current.rotation.y += delta * 0.25
  })
  return <group ref={ref}>{children}</group>
}

/** Publishes the api from inside the Canvas: R3F mounts its children in its own root after the renderer exists, so the page learns about the api from here. */
function LabBridge({ state, exploded, setExploded, reducedMotion, instanceRef, onApi }: { state: PartsState; exploded: boolean; setExploded: (on: boolean) => void; reducedMotion: boolean; instanceRef: React.MutableRefObject<{ instance: ModelInstance | null; timeline: TimelineLike | null }>; onApi?: (api: AtelierApi) => void }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const frames = useRef(0)
  useFrame(() => { frames.current++ })
  const exploredRef = useRef(exploded)
  exploredRef.current = exploded
  useEffect(() => {
    const v = new THREE.Vector3()
    const api: AtelierApi = {
      explode: (on) => setExploded(on),
      select: (part) => state.select(part),
      hover: (part) => state.hover(part),
      screenPositionOf(part) {
        const mesh = instanceRef.current.instance?.parts.get(part)
        if (!mesh) return null
        mesh.getWorldPosition(v).project(camera)
        const rect = gl.domElement.getBoundingClientRect()
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height }
      },
      diagnostics() {
        const instance = instanceRef.current.instance
        const positions: AtelierDiagnostics['positions'] = {}
        if (instance) for (const [name, mesh] of instance.parts) positions[name] = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }
        return { loaded: Boolean(instance), parts: instance ? [...instance.parts.keys()] : [], hovered: state.hovered, selected: state.selected, exploded: exploredRef.current, explodeProgress: Number(instanceRef.current.timeline?.progress() ?? 0), positions, reducedMotion, frames: frames.current, info: { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, calls: gl.info.render.calls, triangles: gl.info.render.triangles } }
      },
    }
    onApi?.(api)
  }, [gl, camera, state, setExploded, reducedMotion, instanceRef, onApi])
  return null
}

export function AtelierR3F({ url = '/models/atelier.draco.glb', exploded, reducedMotion, onSelect, onApi }: AtelierR3FProps) {
  const state = useMemo(() => createPartsState(), [])
  const [explodedState, setExploded] = useState(exploded)
  useEffect(() => setExploded(exploded), [exploded])
  useEffect(() => state.subscribe((s) => onSelect?.(s.selected)), [state, onSelect])
  const instanceRef = useRef<{ instance: ModelInstance | null; timeline: TimelineLike | null }>({ instance: null, timeline: null })
  const onInstance = useCallback((instance: ModelInstance | null, timeline: TimelineLike | null) => { instanceRef.current = { instance, timeline } }, [])
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [2.9, 1.9, 3.3], fov: 42 }} gl={{ antialias: true }} onCreated={({ camera }) => camera.lookAt(0, 0.8, 0)}>
      <color attach="background" args={['#111218']} />
      <CacheBoundary>
        <Studio />
        <Turntable enabled={!reducedMotion}>
          <Suspense fallback={null}>
            <Speaker url={url} exploded={explodedState} reducedMotion={reducedMotion} state={state} onInstance={onInstance} />
          </Suspense>
        </Turntable>
        <LabBridge state={state} exploded={explodedState} setExploded={setExploded} reducedMotion={reducedMotion} instanceRef={instanceRef} onApi={onApi} />
      </CacheBoundary>
    </Canvas>
  )
}

/** The cache needs the Canvas's renderer (KTX2 support detection), so the provider sits inside the Canvas. */
function CacheBoundary({ children }: { children: React.ReactNode }) {
  const gl = useThree((s) => s.gl)
  const create = useCallback(() => createAssetCache({ loaders: createLoaders({ dracoPath: '/draco/', ktx2Path: '/basis/', renderer: gl }) }), [gl])
  return <AssetCacheProvider create={create}>{children}</AssetCacheProvider>
}
```

```tsx
// @verify next:app/lab/atelier-r3f/page.tsx
import { AtelierPage } from './AtelierPage'

export const metadata = { title: 'Atelier, React Three Fiber' }

export default function Page() {
  return <AtelierPage />
}
```

```tsx
// @verify next:app/lab/atelier-r3f/AtelierPage.tsx
'use client'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PART_LABELS, type AtelierPart } from '@/lib/lab/experiences/atelier-parts'
import type { AtelierApi } from '@/features/atelier/AtelierR3F'

// the Canvas and the loaders exist only in the browser: no server render of the 3D module
const AtelierR3F = dynamic(() => import('@/features/atelier/AtelierR3F').then((m) => m.AtelierR3F), { ssr: false })

export function AtelierPage() {
  const [exploded, setExploded] = useState(false)
  const [selected, setSelected] = useState<AtelierPart | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [status, setStatus] = useState('loading')
  const apiRef = useRef<AtelierApi | null>(null)
  useEffect(() => setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches), [])
  const onApi = useCallback((api: AtelierApi) => {
    apiRef.current = api
    const lifecycle = ((window as unknown as { __labLifecycle?: { mounts: number; disposes: number } }).__labLifecycle ??= { mounts: 0, disposes: 0 })
    ;(window as unknown as { __lab?: unknown }).__lab = { kind: 'r3f', get ready() { return api.diagnostics().loaded }, api: { ...api, explode: (on: boolean) => { setExploded(on); api.explode(on) } }, diagnostics: () => api.diagnostics(), lifecycle, disposed: false }
    setStatus('ready')
  }, [])
  useEffect(() => {
    const lifecycle = ((window as unknown as { __labLifecycle?: { mounts: number; disposes: number } }).__labLifecycle ??= { mounts: 0, disposes: 0 })
    lifecycle.mounts++
    return () => {
      lifecycle.disposes++
      const lab = (window as unknown as { __lab?: { disposed?: boolean; afterDispose?: unknown } }).__lab
      if (lab) {
        lab.disposed = true
        lab.afterDispose = apiRef.current?.diagnostics().info ?? null
      }
    }
  }, [])
  return (
    <main style={{ padding: '1rem' }}>
      <h1>Atelier, React Three Fiber</h1>
      <p data-status>{status}</p>
      <div style={{ position: 'relative', width: '100%', maxWidth: 720, aspectRatio: '16 / 10', background: '#111218' }}>
        <AtelierR3F exploded={exploded} reducedMotion={reducedMotion} onSelect={setSelected} onApi={onApi} />
      </div>
      <p>
        <button type="button" data-explode aria-pressed={exploded} onClick={() => setExploded((e) => !e)}>{exploded ? 'Assemble' : 'Explode'}</button>{' '}
        <span data-selected>{selected ? PART_LABELS[selected] : 'Nothing selected'}</span>
      </p>
    </main>
  )
}
```

## 4. TresJS in Nuxt

The async speaker component resolves under a `<Suspense>` placed inside the TresCanvas (the slot runs in TresJS's own renderer app, so a boundary in the page would not see it); a scene component owns the cache (it needs `useTres().renderer.instance` for KTX2 detection), provides it, and renders the async speaker component that awaits the load. Events reach the part through `<primitive>`; the turntable is `useLoop().onBeforeRender`; the explode timeline lives in a `gsap.context()` reverted on unmount.

```ts
// @verify nuxt:composables/useAtelierCache.ts
import { inject, provide, type InjectionKey } from 'vue'
import type { AssetCache } from '~/lib/lab/assets/asset-cache'

export const ATELIER_CACHE: InjectionKey<AssetCache> = Symbol('atelier-cache')
export const provideAtelierCache = (cache: AssetCache) => provide(ATELIER_CACHE, cache)
export function useAtelierCache(): AssetCache {
  const cache = inject(ATELIER_CACHE)
  if (!cache) throw new Error('useAtelierCache: no cache provided by an ancestor scene component')
  return cache
}
```

```vue
<!-- @verify nuxt:components/atelier/AtelierScene.vue -->
<script setup lang="ts">
// Inside <TresCanvas>: owns the asset cache (needs the renderer), the studio light and the turntable; renders the
// async speaker. Disposes the cache and the environment on unmount.
import type * as THREE from 'three'
import { isWebGLRenderer, useLoop, useTres } from '@tresjs/core'
import { createAssetCache } from '~/lib/lab/assets/asset-cache'
import { createLoaders } from '~/lib/lab/assets/loaders'
import { createResourceRegistry } from '~/lib/lab/engine/resource-registry'
import { applyColorPipeline, COLOR_PRESETS } from '~/lib/lab/rendering/color'
import { applyEnvironment, createStudioEnvironment, type EnvironmentHandle } from '~/lib/lab/rendering/environment'
import type { PartsState } from '~/lib/lab/experiences/atelier-parts'

const props = defineProps<{ url: string; exploded: boolean; reducedMotion: boolean; state: PartsState }>()
const { renderer, scene } = useTres()
// useTres() hands out the renderer instance itself (WebGL or WebGPU); the loaders and the environment need WebGL
const gl = isWebGLRenderer(renderer) ? renderer : null
const cache = createAssetCache({ loaders: createLoaders({ dracoPath: '/draco/', ktx2Path: '/basis/', renderer: gl ?? undefined }) })
provideAtelierCache(cache)
const registry = createResourceRegistry()
let environment: EnvironmentHandle | null = null
if (gl) {
  applyColorPipeline(gl, COLOR_PRESETS.product)
  environment = createStudioEnvironment(gl, registry)
  applyEnvironment(scene.value, environment.texture, { intensity: 0.9, rotationY: 0.4 })
}
const turntable = shallowRef<THREE.Group | null>(null)
const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  if (!props.reducedMotion && turntable.value) turntable.value.rotation.y += delta * 0.25
})
onBeforeUnmount(() => {
  scene.value.environment = null
  environment?.dispose()
  registry.dispose()
  cache.dispose()
})
</script>

<template>
  <TresDirectionalLight :position="[3, 5, 4]" :intensity="2.2" color="#fff1dc" />
  <TresDirectionalLight :position="[-4, 3, -5]" :intensity="1" color="#dfe9ff" />
  <TresGroup ref="turntable">
    <!-- the async component resolves inside the TresCanvas app: its Suspense boundary must live here, not in the page -->
    <Suspense>
      <AtelierSpeaker :url="url" :exploded="exploded" :reduced-motion="reducedMotion" :state="state" />
    </Suspense>
  </TresGroup>
</template>
```

```vue
<!-- @verify nuxt:components/atelier/AtelierSpeaker.vue -->
<script setup lang="ts">
// Async component: awaits the model under the page's <Suspense>; instance with its own materials; exploded-view
// timeline in a gsap.context reverted on unmount; pointer events on the primitive map to parts by name.
import gsap from 'gsap'
import * as THREE from 'three'
import { applyHighlight, buildExplodeTimeline, isAtelierPart, type PartsState, type TimelineLike } from '~/lib/lab/experiences/atelier-parts'

const props = defineProps<{ url: string; exploded: boolean; reducedMotion: boolean; state: PartsState }>()
const cache = useAtelierCache()
const handle = await cache.load(props.url)
const instance = handle.instantiate({ ownMaterials: true })
let context: gsap.Context | null = null
let timeline: TimelineLike | null = null
const atelierLab = useAtelierLab()
atelierLab.attach(instance, () => timeline)

onMounted(() => {
  context = gsap.context(() => {
    timeline = buildExplodeTimeline(gsap, new Map<string, THREE.Object3D>(instance.parts), { duration: 0.9 })
    if (props.exploded) timeline.progress(1)
  })
})
watch(() => props.exploded, (exploded) => {
  if (!timeline) return
  if (props.reducedMotion) timeline.progress(exploded ? 1 : 0)
  else if (exploded) timeline.play()
  else timeline.reverse()
})
const stop = props.state.subscribe(() => {
  for (const [name, mesh] of instance.parts) if (isAtelierPart(name)) applyHighlight(mesh, props.state.stateOf(name))
})
const partOf = (event: { object?: THREE.Object3D }) => (event.object && isAtelierPart(event.object.name) ? event.object.name : null)
// TresJS 5 delivers pointermove and click for the mesh under the pointer through the primitive; enter/leave do not
// bubble from child meshes, so hover follows pointermove and the canvas's pointermissed clears it (AtelierTres.vue)
const onMove = (event: { object?: THREE.Object3D }) => props.state.hover(partOf(event))
const onLeave = () => props.state.hover(null)
const onClick = (event: { object?: THREE.Object3D }) => props.state.select(partOf(event))

onBeforeUnmount(() => {
  stop()
  atelierLab.detach()
  context?.revert()
  instance.dispose()
  handle.release()
})
</script>

<template>
  <primitive :object="instance.root" @pointermove="onMove" @pointerleave="onLeave" @click="onClick" />
</template>
```

```ts
// @verify nuxt:composables/useAtelierLab.ts
import type * as THREE from 'three'
import type { ModelInstance } from '~/lib/lab/assets/asset-cache'
import type { TimelineLike } from '~/lib/lab/experiences/atelier-parts'

/** Page-level registry of the live instance and timeline, so the page can publish diagnostics without owning the scene. */
const live: { instance: ModelInstance | null; timeline: (() => TimelineLike | null) | null } = { instance: null, timeline: null }
export function useAtelierLab() {
  return {
    attach(instance: ModelInstance, timeline: () => TimelineLike | null) {
      live.instance = instance
      live.timeline = timeline
    },
    detach() {
      live.instance = null
      live.timeline = null
    },
    get instance() {
      return live.instance
    },
    get timeline() {
      return live.timeline?.() ?? null
    },
    positions(): Record<string, { x: number; y: number; z: number }> {
      const out: Record<string, { x: number; y: number; z: number }> = {}
      if (live.instance) for (const [name, mesh] of live.instance.parts) out[name] = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }
      return out
    },
    worldPosition(part: string, out: THREE.Vector3): THREE.Vector3 | null {
      const mesh = live.instance?.parts.get(part)
      return mesh ? mesh.getWorldPosition(out) : null
    },
  }
}
```

```vue
<!-- @verify nuxt:components/atelier/AtelierTres.vue -->
<script setup lang="ts">
// The canvas with the scene inside the page's <Suspense>; publishes window.__lab for the browser checks.
import * as THREE from 'three'
import { TresCanvas } from '@tresjs/core'
import { createPartsState, type AtelierPart } from '~/lib/lab/experiences/atelier-parts'

const props = defineProps<{ exploded: boolean; reducedMotion: boolean }>()
const emit = defineEmits<{ select: [part: AtelierPart | null]; explode: [on: boolean] }>()
const state = createPartsState()
state.subscribe((s) => emit('select', s.selected))
const canvas = shallowRef<InstanceType<typeof TresCanvas> | null>(null)
const atelierLab = useAtelierLab()
const frames = { count: 0 }

onMounted(() => {
  const lifecycle = (window.__labLifecycle ??= { mounts: 0, disposes: 0 })
  lifecycle.mounts++
  const v = new THREE.Vector3()
  const context = () => (canvas.value as unknown as { context?: { renderer: { instance: THREE.WebGLRenderer }; camera: { activeCamera: { value: THREE.Camera | undefined } } } })?.context
  const lab = {
    kind: 'tres',
    get ready() { return Boolean(atelierLab.instance) },
    api: {
      explode: (on: boolean) => emit('explode', on),
      select: (part: AtelierPart | null) => state.select(part),
      hover: (part: AtelierPart | null) => state.hover(part),
      screenPositionOf(part: AtelierPart) {
        const ctx = context()
        const camera = ctx?.camera.activeCamera.value
        if (!ctx || !camera || !atelierLab.worldPosition(part, v)) return null
        v.project(camera)
        const rect = ctx.renderer.instance.domElement.getBoundingClientRect()
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height }
      },
    },
    diagnostics() {
      const ctx = context()
      const gl = ctx?.renderer.instance
      return { loaded: Boolean(atelierLab.instance), parts: atelierLab.instance ? [...atelierLab.instance.parts.keys()] : [], hovered: state.hovered, selected: state.selected, exploded: props.exploded, explodeProgress: Number(atelierLab.timeline?.progress() ?? 0), positions: atelierLab.positions(), reducedMotion: props.reducedMotion, frames: frames.count, info: gl ? { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, calls: gl.info.render.calls, triangles: gl.info.render.triangles } : null }
    },
    lifecycle,
    disposed: false,
    afterDispose: null as unknown,
  }
  window.__lab = lab
  const tick = () => { frames.count++; raf = requestAnimationFrame(tick) }
  let raf = requestAnimationFrame(tick)
  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    lifecycle.disposes++
    lab.disposed = true
    lab.afterDispose = lab.diagnostics().info
  })
})
</script>

<template>
  <TresCanvas ref="canvas" clear-color="#111218" :dpr="[1, 1.5]" render-mode="always" @pointermissed="state.hover(null)">
    <TresPerspectiveCamera :position="[2.9, 1.9, 3.3]" :fov="42" :look-at="[0, 0.8, 0]" />
    <AtelierScene url="/models/atelier.draco.glb" :exploded="exploded" :reduced-motion="reducedMotion" :state="state" />
  </TresCanvas>
</template>
```

```vue
<!-- @verify nuxt:pages/lab/atelier-tres.vue -->
<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import { PART_LABELS, type AtelierPart } from '~/lib/lab/experiences/atelier-parts'

const exploded = ref(false)
const selected = ref<AtelierPart | null>(null)
const preferred = usePreferredReducedMotion()
const reducedMotion = computed(() => preferred.value === 'reduce')
</script>

<template>
  <main class="lab">
    <h1>Atelier, TresJS</h1>
    <div class="stage">
      <ClientOnly>
        <AtelierTres :exploded="exploded" :reduced-motion="reducedMotion" @select="selected = $event" @explode="exploded = $event" />
      </ClientOnly>
    </div>
    <p>
      <button type="button" data-explode :aria-pressed="exploded" @click="exploded = !exploded">{{ exploded ? 'Assemble' : 'Explode' }}</button>
      <span data-selected>{{ selected ? PART_LABELS[selected] : 'Nothing selected' }}</span>
    </p>
  </main>
</template>

<style scoped>
.lab { padding: 1rem; }
/* TresCanvas fills its parent: the parent carries the size, or the canvas and its container would size each other */
.stage { position: relative; width: 100%; max-width: 720px; aspect-ratio: 16 / 10; background: #111218; }
</style>
```

## 5. What the browser checks prove

`lab-checks.mjs` (`r3f` on the Next app, `tres` on the Nuxt app): the model loads through the cache with the Draco decoder (six parts); the pointer moved over the projected position of the cap turns `hovered` into `cap` through the framework's own event path and a click selects it, which the DOM label reflects; `explode(true)` moves the parts by the documented offsets within the timeline's duration and `explode(false)` restores the assembled pose to 1e-3; under reduced motion the exploded view is a cut (progress 1 at once) and the turntable does not spin; a route change disposes to the renderer's baseline and re-entry recreates with equal counts; no console errors.

## 6. Measured: where the line between shared and specific lands

Shared without change: the cache, the loaders, the parts domain, the explode timeline, the highlight, colour and environment helpers, the diagnostics shape. Adapted: how a component waits for the model (`use()` and a record per cache in React; an async setup under `<Suspense>` in Vue), how the cache is created where the renderer exists (a provider inside the Canvas; a scene component with `useTres()`), how events are typed (`ThreeEvent` vs the Tres event object), how the timeline is owned (`useGSAP` context vs `gsap.context()` in hooks), and how the lifecycle counts (React effects run twice under Strict Mode, the grace period in `useAssetFrom` is the only concession to it). Not shared on purpose: the renderer, loop, scene graph and disposal of declarative objects, which each framework owns; the imperative runtime of `immersive-3d-architecture.md` is for experiences the frameworks do not render.
