# Interactive 3D: pointer, picking, chapters, configurators

Interaction for 3D experiences that stays accessible: a pointer tracked in world space, picking by ray or by GPU id, camera controls that share the camera with the rig instead of fighting it, chapter navigation driven by scroll, keys or buttons, configurators as state machines whose output is material parameters, and the seam where a physics engine plugs in. Every essential interaction has a DOM equivalent; the canvas is never the only way.

## Contents

1. Accessibility contract
2. Pointer in world space
3. Picking: raycast and GPU id
4. Camera controls that share the camera
5. Chapters: one navigator for scroll, keys and buttons
6. Configurators as state machines
7. Physics seam
8. Tests

## 1. Accessibility contract

- The canvas is `aria-hidden` when its content is decorative or mirrored in the DOM; when it *is* the content (a configurator), the DOM carries the same state as controls: a `<select>` or radio group per option, buttons for chapters with `aria-current`, a live region announcing the active chapter or the selected variant.
- Keyboard: Tab reaches every control in reading order; arrow keys orbit when the canvas container has focus (a focusable `div` with `role="group"` and an accessible name, not the canvas), `+`/`-` dolly, Home/End go to the first and last chapter, PageDown/PageUp or ArrowDown/ArrowUp move between chapters when the story has focus. Focus is visible: a stage that fills the viewport cannot rely on the user-agent ring (it would sit outside the viewport), so it paints a double inset ring on `:focus-visible` (a 3 px light line next to a 7 px dark band, `box-shadow: inset 0 0 0 3px #ffd27a, inset 0 0 0 10px rgba(8, 8, 12, 0.9)` on a `::after`) that reads over any frame; the element that carries the `::after` is marked `data-focus-ring` so the legibility check can grade the line against its band (SC 1.4.11).
- Pointer interactions are additive: hover highlights, drag orbits, click selects; nothing essential happens only on hover.
- Every essential 3D interaction has an operable path without a pointer: part selection also happens through a `<select data-part>` (or a radio group) that mirrors the selection made by clicking and drives the same state; the browser checks select through it and read the diagnostics. Hover stays decorative.
- `prefers-reduced-motion`: chapter changes cut instead of travelling, orbit damping is off, auto-rotation never starts.
- Hit targets in the DOM obey the 24 px minimum (`frontend-architect` browser audit checks them); 3D hit targets get a generous pick radius.

## 2. Pointer in world space

The pointer is read once per frame in the `input` phase as normalised device coordinates and, when a system wants a world position, projected onto a plane (the particles' plane, the floor, the plane facing the camera through the subject). Touch keeps the last position after lift so fields do not snap. The projection is pure and tested; the tracker is DOM glue.

```ts
// @verify creative:interaction/pointer.ts nuxt:lib/lab/interaction/pointer.ts next:lib/lab/interaction/pointer.ts
import * as THREE from 'three'

const _ray = new THREE.Raycaster()
const _ndc = new THREE.Vector2()

/** Projects normalised device coordinates onto a world plane; returns null when the ray misses (parallel plane). */
export function ndcToPlane(camera: THREE.Camera, ndcX: number, ndcY: number, plane: THREE.Plane, out = new THREE.Vector3()): THREE.Vector3 | null {
  _ndc.set(ndcX, ndcY)
  _ray.setFromCamera(_ndc, camera)
  return _ray.ray.intersectPlane(plane, out)
}

export interface PointerState {
  /** normalised device coordinates, -1..1 */
  ndc: { x: number; y: number }
  /** last projected world position (kept after the pointer leaves) */
  world: THREE.Vector3
  /** true while a pointer is over the element or a touch is down */
  active: boolean
  down: boolean
  /** -1..1 per frame wheel delta, consumed by whoever reads it */
  wheel: number
}

export interface PointerTracker {
  readonly state: PointerState
  /** call from the input phase: projects the pointer and clears per-frame deltas */
  update(camera: THREE.Camera, plane?: THREE.Plane): PointerState
  dispose(): void
}

export function createPointerTracker(element: HTMLElement, options: { plane?: THREE.Plane } = {}): PointerTracker {
  const state: PointerState = { ndc: { x: 0, y: 0 }, world: new THREE.Vector3(), active: false, down: false, wheel: 0 }
  const plane = options.plane ?? new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  let wheelAccumulator = 0
  const toNdc = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect()
    state.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    state.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }
  const onMove = (event: PointerEvent) => {
    toNdc(event)
    state.active = true
  }
  const onDown = (event: PointerEvent) => {
    toNdc(event)
    state.active = true
    state.down = true
  }
  const onUp = () => {
    state.down = false
  }
  const onLeave = (event: PointerEvent) => {
    // mouse leaving stops the interaction; a lifted touch keeps the last position (no snap)
    if (event.pointerType === 'mouse') state.active = false
  }
  const onWheel = (event: WheelEvent) => {
    wheelAccumulator += Math.sign(event.deltaY)
  }
  element.addEventListener('pointermove', onMove)
  element.addEventListener('pointerdown', onDown)
  element.addEventListener('pointerup', onUp)
  element.addEventListener('pointercancel', onUp)
  element.addEventListener('pointerleave', onLeave)
  element.addEventListener('wheel', onWheel, { passive: true })
  return {
    state,
    update(camera, p = plane) {
      if (state.active) ndcToPlane(camera, state.ndc.x, state.ndc.y, p, state.world)
      state.wheel = Math.max(-1, Math.min(1, wheelAccumulator))
      wheelAccumulator = 0
      return state
    },
    dispose() {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerdown', onDown)
      element.removeEventListener('pointerup', onUp)
      element.removeEventListener('pointercancel', onUp)
      element.removeEventListener('pointerleave', onLeave)
      element.removeEventListener('wheel', onWheel)
    },
  }
}
```

## 3. Picking: raycast and GPU id

A `Raycaster` against a list of pickable objects is right for tens to hundreds of meshes; it is CPU work proportional to the triangles tested, so the picker throttles to a few tests per frame and tests bounding spheres first (Three.js does). For thousands of instances, dense point clouds or picking inside an `InstancedMesh`, GPU picking renders every pickable object with a flat colour that encodes its id into a 1×1 target at the pointer (through `camera.setViewOffset`, so only that pixel is rasterised) and reads the id back: constant cost, one read-back per pick.

```ts
// @verify creative:interaction/picking.ts nuxt:lib/lab/interaction/picking.ts next:lib/lab/interaction/picking.ts
import * as THREE from 'three'
import type { ResourceRegistry } from '../engine/resource-registry'

export interface Hit {
  object: THREE.Object3D
  point: THREE.Vector3
  distance: number
  instanceId?: number
}
export interface Picker {
  /** tests the ray; returns the nearest hit or null (throttled: repeats the last result inside the interval) */
  pick(camera: THREE.Camera, ndcX: number, ndcY: number, now?: number): Hit | null
  /** hover state with enter/leave callbacks; call once per frame with the current pick */
  hover(hit: Hit | null): void
  readonly hovered: THREE.Object3D | null
  dispose(): void
}

export function createRayPicker(targets: THREE.Object3D[], options: { intervalMs?: number; recursive?: boolean; pointThreshold?: number; onEnter?: (object: THREE.Object3D) => void; onLeave?: (object: THREE.Object3D) => void } = {}): Picker {
  const raycaster = new THREE.Raycaster()
  raycaster.params.Points.threshold = options.pointThreshold ?? 0.1
  const ndc = new THREE.Vector2()
  const interval = options.intervalMs ?? 33
  let last = -Infinity
  let lastHit: Hit | null = null
  let hovered: THREE.Object3D | null = null
  return {
    pick(camera, x, y, now = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
      if (now - last < interval) return lastHit
      last = now
      ndc.set(x, y)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObjects(targets, options.recursive ?? true)[0]
      lastHit = hit ? { object: hit.object, point: hit.point, distance: hit.distance, instanceId: hit.instanceId } : null
      return lastHit
    },
    hover(hit) {
      const next = hit?.object ?? null
      if (next === hovered) return
      if (hovered) options.onLeave?.(hovered)
      hovered = next
      if (hovered) options.onEnter?.(hovered)
    },
    get hovered() {
      return hovered
    },
    dispose() {
      if (hovered) options.onLeave?.(hovered)
      hovered = null
    },
  }
}

/** Encodes an id (1..16,777,215) as a colour and back; 0 is "nothing". */
export function idToColor(id: number, out = new THREE.Color()): THREE.Color {
  return out.setRGB(((id >> 16) & 255) / 255, ((id >> 8) & 255) / 255, (id & 255) / 255, THREE.LinearSRGBColorSpace)
}
export function colorToId(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b
}

export interface GpuPicker {
  /** registers an object; its id is returned and written to object.userData.pickId */
  register(object: THREE.Object3D): number
  /** renders the pick pass at the given ndc and returns the object under it, or null */
  pick(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, ndcX: number, ndcY: number): THREE.Object3D | null
  dispose(): void
}

/**
 * GPU picking: a 1×1 render of the scene with id colours. Objects without an id render black (id 0). Uses
 * camera.setViewOffset so only the pixel under the pointer is rasterised; restores the camera after.
 */
export function createGpuPicker(registry: ResourceRegistry): GpuPicker {
  const target = registry.own(new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType }), 'gpu-pick-target')
  const pixel = new Uint8Array(4)
  const objects = new Map<number, THREE.Object3D>()
  const materials = new Map<number, THREE.MeshBasicMaterial>()
  const black = registry.own(new THREE.MeshBasicMaterial({ color: 0x000000 }), 'gpu-pick-black')
  let nextId = 1
  const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  return {
    register(object) {
      const id = nextId++
      objects.set(id, object)
      object.userData.pickId = id
      materials.set(id, registry.own(new THREE.MeshBasicMaterial({ color: idToColor(id) }), `gpu-pick-${id}`))
      return id
    },
    pick(renderer, scene, camera, x, y) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2())
      const px = ((x + 1) / 2) * size.x
      const py = ((1 - y) / 2) * size.y
      // swap materials: id colour for registered meshes, black for everything else
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        originalMaterials.set(mesh, mesh.material)
        const id = mesh.userData.pickId as number | undefined
        mesh.material = (id && materials.get(id)) || black
      })
      const background = scene.background
      scene.background = null
      camera.setViewOffset(size.x, size.y, Math.floor(px), Math.floor(py), 1, 1)
      const previousTarget = renderer.getRenderTarget()
      const previousClear = renderer.getClearColor(new THREE.Color())
      const previousAlpha = renderer.getClearAlpha()
      renderer.setRenderTarget(target)
      renderer.setClearColor(0x000000, 1)
      renderer.clear()
      renderer.render(scene, camera)
      renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel)
      renderer.setRenderTarget(previousTarget)
      renderer.setClearColor(previousClear, previousAlpha)
      camera.clearViewOffset()
      scene.background = background
      for (const [mesh, material] of originalMaterials) mesh.material = material
      originalMaterials.clear()
      const id = colorToId(pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0)
      return objects.get(id) ?? null
    },
    dispose() {
      objects.clear()
      materials.clear()
    },
  }
}
```

## 4. Camera controls that share the camera

`OrbitControls` writes the camera every frame it is enabled; a shot sequence writes it too. The bridge below makes the hand-over explicit: the controls are created disabled, `explore()` releases the rig's claim and enables them from the camera's current pose, `resume()` disables them and lets the next sequence transition away from wherever the user left the camera (`rig.current()`). Keyboard orbit is a thin layer over the same controls (`listenToKeyEvents`), so arrow keys work when the container has focus.

```ts
// @verify creative:interaction/controls.ts nuxt:lib/lab/interaction/controls.ts next:lib/lab/interaction/controls.ts
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { UpdateLoop } from '../engine/update-loop'
import type { CameraRig } from '../cinematic/camera-rig'

export interface ControlsBridge {
  readonly controls: OrbitControls
  readonly exploring: boolean
  /** hands the camera to the user: the rig releases its claim, the controls take it */
  explore(): void
  /** hands the camera back to the rig (the next sequence starts from the camera's current pose) */
  resume(): void
  dispose(): void
}

export function createControlsBridge(loop: UpdateLoop, camera: THREE.PerspectiveCamera, element: HTMLElement, rig: CameraRig, options: { target?: THREE.Vector3; reducedMotion?: boolean; minDistance?: number; maxDistance?: number } = {}): ControlsBridge {
  const controls = new OrbitControls(camera, element)
  controls.enabled = false
  controls.enableDamping = !options.reducedMotion
  controls.dampingFactor = 0.08
  controls.minDistance = options.minDistance ?? 1.5
  controls.maxDistance = options.maxDistance ?? 30
  controls.enablePan = false
  controls.listenToKeyEvents(element) // arrow keys orbit when the container has focus
  if (options.target) controls.target.copy(options.target)
  let exploring = false
  const remove = loop.add('camera', () => {
    if (exploring) controls.update()
  }, 'orbit-controls')
  const claims = ['camera.position', 'camera.quaternion', 'camera.fov']
  return {
    controls,
    get exploring() {
      return exploring
    },
    explore() {
      if (exploring) return
      rig.dispose() // releases the rig's claims
      for (const c of claims) loop.claim(c, 'orbit-controls')
      controls.target.copy(options.target ?? new THREE.Vector3())
      controls.enabled = true
      controls.update()
      exploring = true
    },
    resume() {
      if (!exploring) return
      controls.enabled = false
      for (const c of claims) loop.release(c, 'orbit-controls')
      for (const c of claims) loop.claim(c, 'camera-rig')
      exploring = false
    },
    dispose() {
      remove()
      controls.dispose()
      for (const c of claims) loop.release(c, 'orbit-controls')
    },
  }
}
```

## 5. Chapters: one navigator for scroll, keys and buttons

A story has chapters at known progress values. The navigator is the single owner of "which chapter are we in": scroll reports a progress and the navigator derives the chapter; keys and buttons ask for a chapter and the navigator returns the progress to travel to (the page tweens the sequence there and scrolls the document to match, or cuts under reduced motion). The hash (`#chapter-3`) is both a deep link and a history entry; `aria-current` and a live region follow `index`.

```ts
// @verify creative:interaction/chapters.ts nuxt:lib/lab/interaction/chapters.ts next:lib/lab/interaction/chapters.ts
export interface Chapter {
  id: string
  title: string
  /** progress at which the chapter starts, 0..1, increasing */
  start: number
}
export interface ChapterChange {
  index: number
  chapter: Chapter
  previous: number
  /** how the change was requested */
  source: 'scroll' | 'key' | 'button' | 'hash' | 'init'
}
export interface ChapterNavigator {
  readonly chapters: readonly Chapter[]
  readonly index: number
  readonly progress: number
  /** the chapter a goTo/next/previous/key asked for, until the reported progress reaches it */
  readonly travellingTo: number | null
  /**
   * scroll or a timeline reports a progress; the chapter follows. While travelling to a requested chapter the
   * intermediate chapters the scroll passes through are not announced (no aria-current flicker on the way)
   */
  reportProgress(progress: number): ChapterChange | null
  /** a request to go somewhere; returns the progress to travel to */
  goTo(index: number, source?: ChapterChange['source']): number
  next(source?: ChapterChange['source']): number
  previous(source?: ChapterChange['source']): number
  /** maps a keyboard event to a navigation; returns the progress to travel to, or null when the key is not handled */
  onKey(key: string): number | null
  /** the hash for a chapter and the chapter for a hash */
  hashFor(index: number): string
  fromHash(hash: string): number | null
  subscribe(listener: (change: ChapterChange) => void): () => void
}

export function createChapterNavigator(chapters: Chapter[], initial = 0): ChapterNavigator {
  if (chapters.length === 0) throw new Error('a story needs at least one chapter')
  const sorted = [...chapters].sort((a, b) => a.start - b.start)
  const listeners = new Set<(change: ChapterChange) => void>()
  let index = Math.min(sorted.length - 1, Math.max(0, initial))
  let progress = sorted[index]?.start ?? 0
  let travellingTo: number | null = null
  const emit = (previous: number, source: ChapterChange['source']) => {
    const chapter = sorted[index]
    if (!chapter) return null
    const change: ChapterChange = { index, chapter, previous, source }
    for (const l of listeners) l(change)
    return change
  }
  const indexFor = (p: number) => {
    let i = 0
    for (let k = 0; k < sorted.length; k++) if (p >= (sorted[k]?.start ?? 0)) i = k
    return i
  }
  const travel = (i: number, source: ChapterChange['source']) => {
    const clamped = Math.min(sorted.length - 1, Math.max(0, i))
    const previous = index
    index = clamped
    progress = sorted[clamped]?.start ?? 0
    travellingTo = clamped
    if (previous !== clamped) emit(previous, source)
    return progress
  }
  return {
    chapters: sorted,
    get index() {
      return index
    },
    get progress() {
      return progress
    },
    get travellingTo() {
      return travellingTo
    },
    reportProgress(p) {
      progress = Math.min(1, Math.max(0, p))
      const i = indexFor(progress)
      if (travellingTo !== null) {
        // on the way to a requested chapter: hold the announced chapter until the scroll arrives
        if (i === travellingTo) travellingTo = null
        return null
      }
      if (i === index) return null
      const previous = index
      index = i
      return emit(previous, 'scroll')
    },
    goTo: (i, source = 'button') => travel(i, source),
    next: (source = 'button') => travel(index + 1, source),
    previous: (source = 'button') => travel(index - 1, source),
    onKey(key) {
      switch (key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          return travel(index + 1, 'key')
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          return travel(index - 1, 'key')
        case 'Home':
          return travel(0, 'key')
        case 'End':
          return travel(sorted.length - 1, 'key')
        default:
          return null
      }
    },
    hashFor: (i) => `#${sorted[Math.min(sorted.length - 1, Math.max(0, i))]?.id ?? ''}`,
    fromHash(hash) {
      const id = hash.replace(/^#/, '')
      const i = sorted.findIndex((c) => c.id === id)
      return i >= 0 ? i : null
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

## 6. Configurators as state machines

A product configurator is a set of options with values and constraints; its output is a derived description the scene applies (material parameters per part, visible variants, camera shot to show the change). The state is plain data, so the DOM controls, the URL and the 3D scene all read the same source, and a change can animate (tween the colour, dissolve the old part in and out) because the scene receives the previous and the next description.

```ts
// @verify creative:interaction/configurator.ts nuxt:lib/lab/interaction/configurator.ts next:lib/lab/interaction/configurator.ts
export interface OptionDefinition<V extends string = string> {
  id: string
  label: string
  values: { id: V; label: string }[]
  default: V
}
export interface Constraint {
  /** when option `when.option` has value `when.value`, option `then.option` may only take `then.values` */
  when: { option: string; value: string }
  then: { option: string; values: string[] }
}
export interface ConfiguratorDefinition<S extends Record<string, string>> {
  options: OptionDefinition[]
  constraints?: Constraint[]
  /** turns a selection into what the scene applies */
  derive: (selection: S) => Record<string, unknown>
}
export interface ConfiguratorChange<S> {
  previous: S
  next: S
  changed: keyof S
  derived: Record<string, unknown>
}
export interface Configurator<S extends Record<string, string>> {
  readonly selection: S
  readonly derived: Record<string, unknown>
  /** sets a value; returns null when the value is not available under the current constraints */
  set<K extends keyof S>(option: K, value: S[K]): ConfiguratorChange<S> | null
  available(option: keyof S): string[]
  /** a selection encoded for the URL (`finish=matte&color=red`) and back */
  toQuery(): string
  fromQuery(query: string): void
  subscribe(listener: (change: ConfiguratorChange<S>) => void): () => void
}

export function createConfigurator<S extends Record<string, string>>(definition: ConfiguratorDefinition<S>): Configurator<S> {
  const selection = Object.fromEntries(definition.options.map((o) => [o.id, o.default])) as S
  const listeners = new Set<(change: ConfiguratorChange<S>) => void>()
  const optionIds = definition.options.map((o) => o.id)
  const available = (option: keyof S): string[] => {
    const def = definition.options.find((o) => o.id === option)
    if (!def) return []
    let values = def.values.map((v) => v.id)
    for (const c of definition.constraints ?? []) {
      if (c.then.option === option && selection[c.when.option as keyof S] === c.when.value) values = values.filter((v) => c.then.values.includes(v))
    }
    return values
  }
  let derived = definition.derive(selection)
  const apply = <K extends keyof S>(option: K, value: S[K]): ConfiguratorChange<S> | null => {
    if (!optionIds.includes(option as string) || !available(option).includes(value as string)) return null
    if (selection[option] === value) return null
    const previous = { ...selection }
    selection[option] = value
    // a change can make another option's value unavailable: fall back to its first available value
    for (const other of optionIds as (keyof S)[]) {
      if (other === option) continue
      const allowed = available(other)
      if (allowed.length && !allowed.includes(selection[other] as string)) selection[other] = allowed[0] as S[keyof S]
    }
    derived = definition.derive(selection)
    const change: ConfiguratorChange<S> = { previous, next: { ...selection }, changed: option, derived }
    for (const l of listeners) l(change)
    return change
  }
  return {
    get selection() {
      return { ...selection }
    },
    get derived() {
      return derived
    },
    set: apply,
    available,
    toQuery: () => new URLSearchParams(selection as Record<string, string>).toString(),
    fromQuery(query) {
      const params = new URLSearchParams(query)
      for (const id of optionIds) {
        const value = params.get(id)
        if (value) apply(id as keyof S, value as S[keyof S])
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

## 7. Physics seam

Physics is optional and never a dependency of the skill. When an experience needs it (a product that drops onto the stage, debris in a chapter transition), the engine is a `simulation`-phase system behind a small adapter: fixed-step integration with the loop's delta (accumulate, step at 1/60, interpolate for rendering), bodies mapped to `Object3D`s, the whole world disposed with the runtime. `@dimforge/rapier3d-compat` (WASM, loaded with `await RAPIER.init()` on the client) fits the adapter below; so does any engine with `step`, bodies and a `free`/`dispose`.

```ts
// @verify creative:interaction/physics.ts nuxt:lib/lab/interaction/physics.ts next:lib/lab/interaction/physics.ts
import type * as THREE from 'three'
import type { UpdateLoop } from '../engine/update-loop'

export interface PhysicsBody {
  object: THREE.Object3D
  /** copies the engine's transform into the object (called after each step) */
  sync(): void
}
export interface PhysicsWorldAdapter {
  step(fixedDelta: number): void
  bodies: PhysicsBody[]
  dispose(): void
}

/** Fixed-step driver for any physics adapter: accumulates the loop's delta and steps at `hz`, capped per frame. */
export function attachPhysics(loop: UpdateLoop, world: PhysicsWorldAdapter, options: { hz?: number; maxStepsPerFrame?: number } = {}): () => void {
  const fixed = 1 / (options.hz ?? 60)
  const maxSteps = options.maxStepsPerFrame ?? 4
  let accumulator = 0
  const remove = loop.add('simulation', (frame) => {
    accumulator += frame.delta
    let steps = 0
    while (accumulator >= fixed && steps < maxSteps) {
      world.step(fixed)
      accumulator -= fixed
      steps++
    }
    if (steps === maxSteps) accumulator = 0 // too slow to catch up: drop time instead of spiralling
    for (const body of world.bodies) body.sync()
  }, 'physics')
  return () => {
    remove()
    world.dispose()
  }
}
```

## 8. Tests

```ts
// @verify creative:interaction/interaction.test.ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createUpdateLoop } from '../engine/update-loop'
import { createChapterNavigator } from './chapters'
import { createConfigurator } from './configurator'
import { attachPhysics } from './physics'
import { colorToId, createRayPicker, idToColor } from './picking'
import { ndcToPlane } from './pointer'

describe('pointer projection', () => {
  it('projects the screen centre onto the plane in front of the camera and reports a miss for a parallel plane', () => {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100)
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const centre = ndcToPlane(camera, 0, 0, plane)!
    expect(centre.x).toBeCloseTo(0, 6)
    expect(centre.y).toBeCloseTo(0, 6)
    const right = ndcToPlane(camera, 1, 0, plane)!
    expect(right.x).toBeGreaterThan(2)
    // a horizontal ray above a horizontal plane never meets it (a ray lying inside the plane would return its origin)
    const level = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100)
    level.position.set(0, 2, 5)
    level.lookAt(0, 2, 0)
    level.updateMatrixWorld()
    expect(ndcToPlane(level, 0, 0, new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))).toBeNull()
  })
})

describe('ray picker', () => {
  it('finds the nearest mesh, throttles, and reports hover enter and leave', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const near = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    near.position.z = 2
    near.updateMatrixWorld()
    const far = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3))
    far.updateMatrixWorld()
    const events: string[] = []
    const picker = createRayPicker([near, far], { intervalMs: 100, onEnter: (o) => events.push(`enter:${o === near ? 'near' : 'far'}`), onLeave: (o) => events.push(`leave:${o === near ? 'near' : 'far'}`) })
    const hit = picker.pick(camera, 0, 0, 0)
    expect(hit?.object).toBe(near)
    expect(hit?.distance).toBeCloseTo(7.5, 5)
    expect(picker.pick(camera, 0.9, 0.9, 50)?.object).toBe(near) // inside the interval: the last result
    expect(picker.pick(camera, 0.9, 0.9, 200)).toBeNull()
    picker.hover(hit)
    picker.hover(hit)
    picker.hover(null)
    expect(events).toEqual(['enter:near', 'leave:near'])
    expect(colorToId(...idToColor(123456).toArray().map((c) => Math.round(c * 255)) as [number, number, number])).toBe(123456)
  })
})

describe('chapter navigator', () => {
  const chapters = [{ id: 'arrival', title: 'Arrival', start: 0 }, { id: 'inside', title: 'Inside', start: 0.3 }, { id: 'detail', title: 'Detail', start: 0.65 }]
  it('derives the chapter from progress and travels by key, button and hash', () => {
    const nav = createChapterNavigator(chapters)
    const log: string[] = []
    nav.subscribe((c) => log.push(`${c.previous}>${c.index}:${c.source}`))
    expect(nav.reportProgress(0.1)).toBeNull()
    expect(nav.reportProgress(0.31)?.chapter.id).toBe('inside')
    expect(nav.reportProgress(0.9)?.chapter.id).toBe('detail')
    expect(nav.onKey('ArrowLeft')).toBe(0.3)
    expect(nav.onKey('Home')).toBe(0)
    expect(nav.onKey('End')).toBe(0.65)
    expect(nav.onKey('Tab')).toBeNull()
    expect(nav.next()).toBe(0.65) // already last: stays, no event
    expect(nav.goTo(1, 'hash')).toBe(0.3)
    expect(nav.hashFor(2)).toBe('#detail')
    expect(nav.fromHash('#inside')).toBe(1)
    expect(nav.fromHash('#nope')).toBeNull()
    expect(log).toEqual(['0>1:scroll', '1>2:scroll', '2>1:key', '1>0:key', '0>2:key', '2>1:hash'])
  })

  it('does not announce the chapters the scroll passes through on the way to a requested one', () => {
    const nav = createChapterNavigator(chapters)
    const log: string[] = []
    nav.subscribe((c) => log.push(`${c.previous}>${c.index}:${c.source}`))
    expect(nav.goTo(2)).toBe(0.65)
    expect(nav.travellingTo).toBe(2)
    // a smooth scroll reports intermediate progress values: chapter 2 is crossed, nothing is announced
    for (const p of [0.1, 0.3, 0.4, 0.5, 0.6]) expect(nav.reportProgress(p)).toBeNull()
    expect(nav.index).toBe(2)
    expect(nav.reportProgress(0.7)).toBeNull() // arrived: travelling ends
    expect(nav.travellingTo).toBeNull()
    expect(nav.reportProgress(0.4)?.index).toBe(1) // ordinary scrolling announces again
    expect(log).toEqual(['0>2:button', '2>1:scroll'])
  })
})

describe('configurator', () => {
  type Selection = { finish: string; color: string }
  const def = {
    options: [
      { id: 'finish', label: 'Finish', values: [{ id: 'matte', label: 'Matte' }, { id: 'gloss', label: 'Gloss' }], default: 'matte' },
      { id: 'color', label: 'Colour', values: [{ id: 'graphite', label: 'Graphite' }, { id: 'red', label: 'Red' }, { id: 'pearl', label: 'Pearl' }], default: 'graphite' },
    ],
    constraints: [{ when: { option: 'finish', value: 'matte' }, then: { option: 'color', values: ['graphite', 'red'] } }],
    derive: (s: Selection) => ({ roughness: s.finish === 'matte' ? 0.7 : 0.15, clearcoat: s.finish === 'gloss' ? 1 : 0, color: { graphite: '#2b2b30', red: '#8a1020', pearl: '#efe9e0' }[s.color] }),
  }
  it('applies constraints, derives scene parameters, round-trips through a query string', () => {
    const c = createConfigurator<Selection>(def)
    expect(c.available('color')).toEqual(['graphite', 'red'])
    expect(c.set('color', 'pearl')).toBeNull()
    const change = c.set('finish', 'gloss')!
    expect(change.changed).toBe('finish')
    expect(c.available('color')).toEqual(['graphite', 'red', 'pearl'])
    expect(c.set('color', 'pearl')?.derived).toEqual({ roughness: 0.15, clearcoat: 1, color: '#efe9e0' })
    // going back to matte makes pearl unavailable: the colour falls back to the first available
    expect(c.set('finish', 'matte')?.next).toEqual({ finish: 'matte', color: 'graphite' })
    expect(c.toQuery()).toBe('finish=matte&color=graphite')
    c.fromQuery('finish=gloss&color=red')
    expect(c.selection).toEqual({ finish: 'gloss', color: 'red' })
    expect(c.set('finish', 'gloss')).toBeNull() // no-op
  })
})

describe('physics driver', () => {
  it('steps at a fixed rate from the loop delta, caps catch-up, and disposes the world', () => {
    const loop = createUpdateLoop({ schedule: () => {}, unschedule: () => {}, maxDelta: 10 })
    const steps: number[] = []
    let synced = 0
    let disposed = false
    const object = new THREE.Object3D()
    const detach = attachPhysics(loop, { step: (dt) => steps.push(dt), bodies: [{ object, sync: () => synced++ }], dispose: () => { disposed = true } }, { hz: 60, maxStepsPerFrame: 4 })
    loop.step(0)
    loop.step(16.7)
    expect(steps.length).toBe(1)
    loop.step(16.7 + 1000) // a one-second hitch: at most four steps, the rest is dropped
    expect(steps.length).toBe(5)
    expect(steps.every((s) => Math.abs(s - 1 / 60) < 1e-9)).toBe(true)
    expect(synced).toBe(3)
    detach()
    expect(disposed).toBe(true)
    expect(loop.systems()).toEqual([])
  })
})
```
