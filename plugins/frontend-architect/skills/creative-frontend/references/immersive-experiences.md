# Immersive experiences: three reference builds

Three complete experiences built only from the modules of this skill, with procedural assets, mounted by the Nuxt and Next verification apps and driven in Chromium: a cinematic product experience, a GPU particle experience and an immersive story. They are the proof that the architecture (`immersive-3d-architecture.md`), the choreography (`cinematic-motion.md`), the shaders (`shader-engineering.md`), the particles (`gpu-particles.md`), the rendering (`rendering-quality.md`) and the interaction (`interactive-3d.md`) compose into something a studio would ship, and they are the fixtures the browser checks measure. Each exposes an `api` the page binds to scroll, keys and buttons, and `diagnostics()` the checks read.

## Contents

1. How an experience is structured
2. A. Cinematic product experience
3. B. GPU particle experience
4. C. Immersive story
5. Mounting in Nuxt and Next
6. What the browser checks prove
7. Lab pages

## 1. How an experience is structured

```
createXExperience({ canvas, reducedMotion, tier, gsap? })
  → runtime (renderer, scene, loop, registry)      one clock, one registry
  → spaces (scene graphs, lights, environment)     own resources, shared environment
  → rig + sequence + cues                           a pure function of progress
  → interaction (pointer, configurator, navigator)  DOM and canvas read the same state
  → post pipeline at the quality tier
  → api: seek(progress), goTo(chapter), setX(...)   what the page calls
  → diagnostics(): camera, progress, cues, counts   what the checks read
  → dispose()                                       back to the renderer's baseline
```

The page owns scroll (`ScrollTrigger` scrub → `api.seek`), the keyboard (`api.key`), the buttons and the DOM captions; the experience owns everything on the canvas. `reducedMotion` is decided by the page once and passed in: the experience then cuts instead of travelling, freezes time-based motion and never auto-plays.

## 2. A. Cinematic product experience

A perfume bottle built from lathe profiles: clear glass with transmission and thickness, a tinted liquid inside, a brushed-metal cap with a lacquered collar and a ceramic label, on a dark glossy floor under a procedural sun environment and a three-light rig with one fitted shadow. Four shots (establishing orbit, cap close-up, low angle, reverse) with holds, driven by progress; cues move the depth-of-field focus to each shot's subject, raise the key light on the close-up, and show captions. A configurator changes finish and colour with GSAP tweens on the material colours; an explore button hands the camera to orbit controls and back.

```ts
// @verify creative:experiences/product-experience.ts nuxt:lib/lab/experiences/product-experience.ts next:lib/lab/experiences/product-experience.ts
import * as THREE from 'three'
import { createSceneRuntime, type DisposalReport, type SceneRuntime } from '../engine/scene-runtime'
import { driveGsapFromLoop, type GsapClockHost } from '../engine/gsap-clock'
import { createCameraRig, orbit, type Shot } from '../cinematic/camera-rig'
import { createShotSequence, type ShotSequence } from '../cinematic/sequence'
import { createCueSheet, type CueSheet } from '../cinematic/cues'
import { createPostPipeline, type PostPipeline } from '../shaders/post/pipeline'
import { applyColorPipeline, COLOR_PRESETS } from '../rendering/color'
import { applyEnvironment, createGradientEnvironment } from '../rendering/environment'
import { createPhysicalMaterial } from '../rendering/materials'
import { configureShadows, fitShadowCamera } from '../rendering/shadows'
import { QUALITY_TIERS, type QualityTier } from '../rendering/quality'
import { createControlsBridge, type ControlsBridge } from '../interaction/controls'
import { createConfigurator, type Configurator } from '../interaction/configurator'

export type ProductSelection = { finish: string; color: string }
export const PRODUCT_COLORS: Record<string, string> = { amber: '#c8782a', noir: '#1c1a22', rose: '#c9607a' }

export interface ProductExperienceOptions {
  canvas: HTMLCanvasElement
  /** element that receives orbit-control events and keyboard focus in explore mode */
  controlsElement: HTMLElement
  reducedMotion: boolean
  tier?: QualityTier
  gsap?: GsapClockHost & { to(target: object, vars: object): unknown }
  /** called when a caption cue enters or leaves (the page toggles the DOM) */
  onCaption?: (id: string, active: boolean) => void
}

export interface ProductDiagnostics {
  progress: number
  shot: { index: number; name: string; local: number }
  camera: { x: number; y: number; z: number; fov: number }
  focus: number
  keyIntensity: number
  cues: string[]
  selection: ProductSelection
  capColor: string
  exploring: boolean
  owners: Record<string, string>
  tier: string
  reducedMotion: boolean
  stats: ReturnType<SceneRuntime['stats']>
}

export interface ProductExperience {
  readonly shots: Shot[]
  readonly sequence: ShotSequence
  readonly cues: CueSheet
  readonly configurator: Configurator<ProductSelection>
  readonly post: PostPipeline
  seek(progress: number): ProductDiagnostics
  explore(): void
  resume(): void
  diagnostics(): ProductDiagnostics
  /** opens a fresh frame-timing window (the gpu harness measures from here) */
  resetTiming(options?: { gpu?: boolean }): void
  dispose(): DisposalReport | null
}

function bottleProfile(): THREE.Vector2[] {
  const points: THREE.Vector2[] = []
  const profile: [number, number][] = [[0, 0], [0.9, 0], [1.05, 0.08], [1.1, 0.5], [1.08, 1.6], [0.95, 2.1], [0.55, 2.35], [0.42, 2.5], [0.42, 2.8], [0.5, 2.82]]
  for (const [x, y] of profile) points.push(new THREE.Vector2(x, y))
  return points
}

export function createProductExperience(options: ProductExperienceOptions): ProductExperience {
  const tier = options.tier ?? QUALITY_TIERS[1]!
  const runtime = createSceneRuntime({ canvas: options.canvas, maxPixelRatio: tier.pixelRatio, antialias: false })
  const { renderer, scene, camera, loop, registry } = runtime
  applyColorPipeline(renderer, { ...COLOR_PRESETS.product, exposure: 0.8 })
  const restoreGsap = options.gsap ? driveGsapFromLoop(loop, options.gsap) : () => {}

  // light: a soft studio sky with one sun, kept below the level where the floor outshines the bottle
  const environment = createGradientEnvironment(renderer, registry, { top: '#232c44', horizon: '#c9b8a2', bottom: '#101014', sun: { direction: new THREE.Vector3(0.5, 0.7, 0.4), intensity: 8, size: 0.05 } })
  applyEnvironment(scene, environment.texture, { intensity: 0.6, rotationY: 0.6 })
  scene.background = new THREE.Color('#0d0d12')
  const key = new THREE.DirectionalLight('#fff1dc', 2.2)
  key.position.set(4, 7, 5)
  const fill = new THREE.HemisphereLight('#9fb4d8', '#1a1612', 0.5)
  const rim = new THREE.DirectionalLight('#ffd9b0', 1.4)
  rim.position.set(-5, 4, -6)
  scene.add(key, key.target, fill, rim)

  // the product
  const bottle = new THREE.Group()
  const glass = createPhysicalMaterial('clearGlass', { color: '#f4f6ff', thickness: 0.35, roughness: 0.04 })
  const liquid = createPhysicalMaterial('frostedGlass', { color: PRODUCT_COLORS.amber, transmission: 0.9, roughness: 0.2, thickness: 1.2, attenuationColor: PRODUCT_COLORS.amber, attenuationDistance: 0.8 })
  const cap = createPhysicalMaterial('brushedMetal', { color: '#cfcfd4', roughness: 0.3 })
  const collar = createPhysicalMaterial('carPaint', { color: PRODUCT_COLORS.amber })
  const label = createPhysicalMaterial('ceramic', { color: '#f4efe6' })
  for (const [m, name] of [[glass, 'glass'], [liquid, 'liquid'], [cap, 'cap'], [collar, 'collar'], [label, 'label']] as const) registry.own(m, name)
  const body = new THREE.Mesh(registry.own(new THREE.LatheGeometry(bottleProfile(), 96), 'bottle-body'), glass)
  const inner = new THREE.Mesh(registry.own(new THREE.LatheGeometry(bottleProfile().slice(0, 7).map((p) => new THREE.Vector2(p.x * 0.9, Math.min(p.y, 1.9) * 0.95 + 0.04)), 64), 'bottle-liquid'), liquid)
  const capMesh = new THREE.Mesh(registry.own(new THREE.CylinderGeometry(0.46, 0.5, 0.7, 48), 'cap'), cap)
  capMesh.position.y = 3.15
  const collarMesh = new THREE.Mesh(registry.own(new THREE.TorusGeometry(0.46, 0.06, 16, 64), 'collar'), collar)
  collarMesh.rotation.x = Math.PI / 2
  collarMesh.position.y = 2.82
  const labelMesh = new THREE.Mesh(registry.own(new THREE.CylinderGeometry(1.1, 1.1, 0.5, 96, 1, true), 'label'), label)
  labelMesh.position.y = 1
  for (const mesh of [body, inner, capMesh, collarMesh, labelMesh]) {
    mesh.castShadow = true
    mesh.receiveShadow = true
    bottle.add(mesh)
  }
  scene.add(bottle)
  const floor = new THREE.Mesh(registry.own(new THREE.CircleGeometry(14, 64), 'floor'), registry.own(createPhysicalMaterial('ceramic', { color: '#0b0b0f', roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.25 }), 'floor-material'))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  if (tier.shadows) {
    configureShadows(renderer, key, { mapSize: tier.shadowMapSize })
    fitShadowCamera(key, new THREE.Box3().setFromObject(bottle), 1)
  }

  // choreography
  const centre = { x: 0, y: 1.4, z: 0 }
  const capPoint = { x: 0, y: 3, z: 0 }
  const shots: Shot[] = [
    orbit(centre, 8.5, 0.55, 0.22, { name: 'establishing', fov: 36 }),
    orbit(capPoint, 2.4, -0.5, 0.45, { name: 'cap', fov: 30 }),
    orbit({ x: 0, y: 1, z: 0 }, 4.5, 2.3, -0.02, { name: 'low', fov: 44 }),
    orbit(centre, 6, 3.7, 0.4, { name: 'reverse', fov: 34 }),
  ]
  const rig = createCameraRig(camera, loop)
  const sequence = createShotSequence(rig, [{ shot: shots[0]!, hold: 0.6 }, { shot: shots[1]!, weight: 1.4, hold: 0.6 }, { shot: shots[2]!, weight: 1.2, hold: 0.4 }, { shot: shots[3]!, weight: 1.2, hold: 0.5 }])
  const post = createPostPipeline(runtime, { quality: tier.post, bloom: { strength: 0.35, threshold: 0.9 }, dof: { focus: 8.5, aperture: 0.0003, maxblur: 0.01 }, grain: { amount: 0.035, vignette: 0.3 } })
  const state = { focus: 8.5, keyIntensity: 2.2 }
  const cues = createCueSheet()
  const captions = ['establishing', 'cap', 'low', 'reverse']
  // focus follows the shot: one cue per shot over its segment and hold, so seeking backwards restores the earlier focus
  const distanceOf = (shot: Shot) => Math.hypot(shot.position.x - shot.target.x, shot.position.y - shot.target.y, shot.position.z - shot.target.z)
  captions.forEach((id, i) => {
    const start = i === 0 ? 0 : sequence.startOf(sequence.segments.findIndex((s) => s.name === id))
    const next = captions[i + 1]
    const end = next ? sequence.startOf(sequence.segments.findIndex((s) => s.name === next)) : 1.01
    const distance = distanceOf(shots[i]!)
    cues.add({ name: `focus:${id}`, start, end, enter: () => { state.focus = distance; post.focus(distance) } })
  })
  captions.forEach((id, i) => {
    const start = i === 0 ? 0 : sequence.startOf(sequence.segments.findIndex((s) => s.name === id))
    const next = captions[i + 1]
    const end = next ? sequence.startOf(sequence.segments.findIndex((s) => s.name === next)) : 1.01
    cues.add({ name: `caption:${id}`, start, end, enter: () => options.onCaption?.(id, true), leave: () => options.onCaption?.(id, false) })
  })
  cues.add({ name: 'key:close-up', start: sequence.startOf(1), end: sequence.startOf(3), update: (t) => { state.keyIntensity = 2.2 + 1.3 * Math.sin(Math.PI * t); key.intensity = state.keyIntensity } })

  // configurator: finish and colour, tweened through GSAP when available
  const configurator = createConfigurator<ProductSelection>({
    options: [
      { id: 'finish', label: 'Finish', values: [{ id: 'brushed', label: 'Brushed' }, { id: 'polished', label: 'Polished' }], default: 'brushed' },
      { id: 'color', label: 'Colour', values: Object.keys(PRODUCT_COLORS).map((id) => ({ id, label: id })), default: 'amber' },
    ],
    derive: (s) => ({ roughness: s.finish === 'brushed' ? 0.3 : 0.08, anisotropy: s.finish === 'brushed' ? 0.8 : 0, color: PRODUCT_COLORS[s.color] ?? PRODUCT_COLORS.amber }),
  })
  const applySelection = (derived: Record<string, unknown>, animate: boolean) => {
    const colour = new THREE.Color(String(derived.color))
    cap.roughness = Number(derived.roughness)
    cap.anisotropy = Number(derived.anisotropy)
    for (const material of [liquid, collar]) {
      if (animate && options.gsap && !options.reducedMotion) options.gsap.to(material.color, { r: colour.r, g: colour.g, b: colour.b, duration: 0.8, ease: 'power2.out' })
      else material.color.copy(colour)
      if (material === liquid) liquid.attenuationColor.copy(colour)
    }
  }
  configurator.subscribe((change) => applySelection(change.derived, true))

  let bridge: ControlsBridge | null = null
  const diagnostics = (): ProductDiagnostics => ({
    progress: sequence.state.progress,
    shot: { index: sequence.state.segment, name: sequence.state.name, local: sequence.state.local },
    camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov },
    focus: state.focus,
    keyIntensity: state.keyIntensity,
    cues: [...cues.active],
    selection: configurator.selection,
    capColor: `#${collar.color.getHexString()}`,
    exploring: bridge?.exploring ?? false,
    owners: Object.fromEntries(loop.owners()),
    tier: tier.name,
    reducedMotion: options.reducedMotion,
    stats: runtime.stats(),
  })

  sequence.seek(0)
  cues.seek(0)
  runtime.start()

  return {
    shots,
    sequence,
    cues,
    configurator,
    post,
    seek(progress) {
      // while the user explores, the scroll scrub is paused by the page; a seek that still arrives is ignored
      if (bridge?.exploring) return diagnostics()
      sequence.seek(progress)
      cues.seek(progress)
      return diagnostics()
    },
    explore() {
      bridge ??= createControlsBridge(loop, camera, options.controlsElement, rig, { target: new THREE.Vector3(centre.x, centre.y, centre.z), reducedMotion: options.reducedMotion, minDistance: 2, maxDistance: 14 })
      bridge.explore()
    },
    resume() {
      bridge?.resume()
    },
    diagnostics,
    resetTiming: (options) => runtime.resetTiming(options),
    dispose() {
      cues.reset()
      bridge?.dispose()
      post.dispose()
      rig.dispose()
      environment.dispose()
      key.shadow.dispose() // the shadow map is a render target the renderer allocated for the light
      restoreGsap()
      return runtime.dispose()
    },
  }
}
```

## 3. B. GPU particle experience

Tens of thousands of particles in a float-texture simulation form a sphere, scatter into turbulence and reassemble on the surface of a procedural emblem as progress advances; the pointer pushes them aside; a density control and the adaptive controller trade count for frame time; where float render targets are missing the stateless instanced field takes over with the same formations.

```ts
// @verify creative:experiences/particle-experience.ts nuxt:lib/lab/experiences/particle-experience.ts next:lib/lab/experiences/particle-experience.ts
import * as THREE from 'three'
import { createSceneRuntime, type DisposalReport, type SceneRuntime } from '../engine/scene-runtime'
import { smoothstep } from '../cinematic/interpolation'
import { createPointerTracker, type PointerTracker } from '../interaction/pointer'
import { sphereFormation, surfaceFormation } from '../particles/formations'
import { createGpgpuSimulation, type GpgpuSimulation } from '../particles/gpgpu-simulation'
import { createInstancedField } from '../particles/instanced-field'
import { createDensityController, type DensityController } from '../particles/density-controller'
import { QUALITY_TIERS, type QualityTier } from '../rendering/quality'

export interface ParticleExperienceOptions {
  canvas: HTMLCanvasElement
  pointerElement: HTMLElement
  reducedMotion: boolean
  tier?: QualityTier
  /** adapt the drawn count to measured frame times (default true, off under reduced motion) */
  adaptive?: boolean
}

export interface ParticleDiagnostics {
  mode: 'gpgpu' | 'instanced'
  side: number
  count: number
  drawn: number
  progress: number
  morph: number
  curl: number
  pointer: { x: number; y: number; z: number; active: boolean }
  density: number
  tier: string
  adaptiveTier: string | null
  drawCalls: number
  reducedMotion: boolean
  stats: ReturnType<SceneRuntime['stats']>
}

export interface ParticleExperience {
  seek(progress: number): ParticleDiagnostics
  setDensity(fraction: number): void
  /** a world-space pointer for tests; the page's pointer tracker does this from events */
  setPointer(x: number, y: number, z: number, active?: boolean): void
  /** advances the simulation by `seconds` of fixed 1/60 steps without rendering (tests, and a warm start before the first frame) */
  advance(seconds: number): void
  /** positions read back from the simulation (xyzw), or null for the instanced field */
  readPositions(): Float32Array | null
  readonly formations: { a: Float32Array; b: Float32Array }
  diagnostics(): ParticleDiagnostics
  /** opens a fresh frame-timing window (the gpu harness measures from here) */
  resetTiming(options?: { gpu?: boolean }): void
  dispose(): DisposalReport | null
}

const SIDES: Record<QualityTier['name'], number> = { ultra: 256, high: 192, medium: 128, low: 96, minimal: 64 }

export function createParticleExperience(options: ParticleExperienceOptions): ParticleExperience {
  const tier = options.tier ?? QUALITY_TIERS[2]!
  const runtime = createSceneRuntime({ canvas: options.canvas, maxPixelRatio: tier.pixelRatio, antialias: false })
  const { renderer, scene, camera, loop, registry } = runtime
  scene.background = new THREE.Color('#05060b')
  camera.position.set(0, 0.5, 8)
  camera.lookAt(0, 0, 0)
  const side = SIDES[tier.name]
  const count = side * side
  const emblem = new THREE.Mesh(new THREE.TorusKnotGeometry(1.6, 0.45, 160, 20, 2, 3))
  const formations = { a: sphereFormation(count, 2.2), b: surfaceFormation(emblem, count, 17) }
  emblem.geometry.dispose()
  const floatTargets = Boolean(renderer.getContext().getExtension('EXT_color_buffer_float'))

  let sim: GpgpuSimulation | null = null
  let field: ReturnType<typeof createInstancedField> | null = null
  if (floatTargets) {
    sim = createGpgpuSimulation(renderer, registry, { side, formationA: formations.a, formationB: formations.b, colorSlow: '#5b8cff', colorFast: '#ffd27a' })
    scene.add(sim.points)
  } else {
    field = createInstancedField(registry, { count, formationA: formations.a, formationB: formations.b, size: 0.05, color: '#8fb8ff' })
    scene.add(field.mesh)
  }
  const pointer: PointerTracker = createPointerTracker(options.pointerElement)
  const state = { progress: 0, morph: 0, curl: 0, density: tier.particleDensity, drawn: count }
  const applyDensity = (fraction: number) => {
    state.density = Math.min(1, Math.max(0.02, fraction))
    state.drawn = Math.round(count * state.density)
    sim?.setCount(state.drawn)
    field?.setCount(state.drawn)
  }
  applyDensity(tier.particleDensity)

  // scroll choreography: hold the sphere, scatter, reassemble on the emblem
  const choreograph = (p: number) => {
    state.progress = Math.min(1, Math.max(0, p))
    const scatter = Math.sin(Math.PI * smoothstep(0.3, 0.75, state.progress)) // 0 → 1 → 0 across the middle
    state.morph = smoothstep(0.45, 0.8, state.progress)
    state.curl = options.reducedMotion ? 0 : 0.6 + 3.2 * scatter
    if (sim) {
      sim.velocity.uMorph.value = state.morph
      sim.velocity.uCurl.value = state.curl
      sim.velocity.uAttraction.value = 4 - 3 * scatter
    }
    if (field) {
      field.uniforms.uMorph.value = state.morph
      field.uniforms.uFlow.value = options.reducedMotion ? 0 : 0.4 + 1.2 * scatter
    }
  }
  choreograph(0)

  // a pointer set through the api (tests, a scripted tour) takes precedence over the tracked one
  let manualPointer: THREE.Vector3 | null = null
  loop.add('input', () => {
    const p = pointer.update(camera)
    const target = sim ? sim.velocity.uPointer.value : field!.uniforms.uPointer.value
    if (manualPointer) target.copy(manualPointer)
    else if (p.active && !options.reducedMotion) target.copy(p.world)
    else target.set(1e3, 1e3, 1e3)
  }, 'pointer')
  loop.add('simulation', (frame) => {
    sim?.compute(frame.delta)
    field?.update(frame.delta)
  }, 'particles')

  let controller: DensityController | null = null
  if ((options.adaptive ?? true) && !options.reducedMotion) {
    controller = createDensityController({ budgetMs: tier.budgetMs, downAfter: 12, upAfter: 240, cooldown: 20, initial: 0 })
    loop.add('state', (frame) => {
      if (frame.delta <= 0) return
      const next = controller!.sample(frame.delta * 1000)
      if (next) applyDensity(tier.particleDensity * next.density)
    }, 'density')
  }

  const diagnostics = (): ParticleDiagnostics => ({
    mode: sim ? 'gpgpu' : 'instanced',
    side,
    count,
    drawn: state.drawn,
    progress: state.progress,
    morph: state.morph,
    curl: state.curl,
    pointer: { ...(sim ? sim.velocity.uPointer.value : field!.uniforms.uPointer.value), active: Boolean(manualPointer) || pointer.state.active },
    density: state.density,
    tier: tier.name,
    adaptiveTier: controller?.tier.name ?? null,
    drawCalls: runtime.stats().info.calls, // the last completed frame's draws
    reducedMotion: options.reducedMotion,
    stats: runtime.stats(),
  })
  runtime.start()
  return {
    seek(progress) {
      choreograph(progress)
      return diagnostics()
    },
    setDensity: applyDensity,
    setPointer(x, y, z, active = true) {
      manualPointer = active ? new THREE.Vector3(x, y, z) : null
      const target = sim ? sim.velocity.uPointer.value : field!.uniforms.uPointer.value
      if (active) target.set(x, y, z)
      else target.set(1e3, 1e3, 1e3)
    },
    advance(seconds) {
      const steps = Math.max(0, Math.round(seconds * 60))
      for (let i = 0; i < steps; i++) {
        sim?.compute(1 / 60)
        field?.update(1 / 60)
      }
    },
    readPositions: () => (sim ? sim.readPositions() : null),
    formations,
    diagnostics,
    resetTiming: (options) => runtime.resetTiming(options),
    dispose() {
      pointer.dispose()
      if (sim) {
        scene.remove(sim.points)
        sim.dispose()
      }
      if (field) scene.remove(field.mesh)
      return runtime.dispose()
    },
  }
}
```

## 4. C. Immersive story

Three spaces, each its own scene with its own camera and shots: a field of monoliths under a dawn sky (a tracking shot down a path), a hall of holographic pillars over a floor that dissolves as the chapter ends (an orbit), and a close-up on an iridescent artefact inside a field of particles (a slow push-in). Two scene transitions, an iris and a dissolve, sit at the chapter boundaries. One navigator owns the chapter: scroll reports progress, keys and buttons ask for a chapter and the story travels (or cuts under reduced motion). Captions and `aria-current` follow the navigator; portrait viewports widen the field of view.

```ts
// @verify creative:experiences/story-experience.ts nuxt:lib/lab/experiences/story-experience.ts next:lib/lab/experiences/story-experience.ts
import * as THREE from 'three'
import { createSceneRuntime, type DisposalReport, type SceneRuntime } from '../engine/scene-runtime'
import { createCameraRig, orbit, type CameraRig, type Shot } from '../cinematic/camera-rig'
import { createPath, trackingShot } from '../cinematic/paths'
import { createShotSequence, type ShotSequence } from '../cinematic/sequence'
import { createCueSheet, type CueSheet } from '../cinematic/cues'
import { createSceneTransition, type SceneTransition } from '../cinematic/scene-transition'
import { clamp01, smoothstep } from '../cinematic/interpolation'
import { createChapterNavigator, type ChapterNavigator } from '../interaction/chapters'
import { createDisplacedStandardMaterial, createDissolveMaterial, createHolographicMaterial, createIridescentMaterial } from '../shaders/materials'
import { createPostPipeline, type PostPipeline } from '../shaders/post/pipeline'
import { applyColorPipeline, COLOR_PRESETS } from '../rendering/color'
import { applyEnvironment, createGradientEnvironment } from '../rendering/environment'
import { createPhysicalMaterial } from '../rendering/materials'
import { QUALITY_TIERS, type QualityTier } from '../rendering/quality'
import { createInstancedField } from '../particles/instanced-field'
import { ringFormation, sphereFormation } from '../particles/formations'

export interface StoryExperienceOptions {
  canvas: HTMLCanvasElement
  reducedMotion: boolean
  tier?: QualityTier
  onCaption?: (chapterId: string, active: boolean) => void
}

export interface StoryDiagnostics {
  progress: number
  chapter: { index: number; id: string }
  local: number
  transition: { active: boolean; mode: string; progress: number }
  camera: { space: number; x: number; y: number; z: number; fov: number }
  fovScale: number
  cues: string[]
  dissolve: number
  reducedMotion: boolean
  stats: ReturnType<SceneRuntime['stats']>
}

export interface StoryExperience {
  readonly navigator: ChapterNavigator
  readonly cues: CueSheet
  /** the progress windows of the two transitions */
  readonly transitions: { from: number; to: number; mode: string }[]
  seek(progress: number): StoryDiagnostics
  /** keyboard: returns the progress to travel to, or null */
  key(key: string): number | null
  goTo(index: number): number
  /** camera position a space's rig would hold at a local progress (for checks) */
  checkpoint(space: number, local: number): { x: number; y: number; z: number }
  diagnostics(): StoryDiagnostics
  /** opens a fresh frame-timing window (the gpu harness measures from here) */
  resetTiming(options?: { gpu?: boolean }): void
  dispose(): DisposalReport | null
}

interface Space {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  rig: CameraRig
  sequence: ShotSequence
  update: (delta: number, local: number) => void
}

export const STORY_CHAPTERS = [
  { id: 'arrival', title: 'Arrival', start: 0 },
  { id: 'hall', title: 'The hall', start: 0.34 },
  { id: 'artefact', title: 'The artefact', start: 0.68 },
]
const TRANSITIONS = [
  { from: 0.3, to: 0.38, mode: 'iris' as const },
  { from: 0.64, to: 0.72, mode: 'dissolve' as const },
]

export function createStoryExperience(options: StoryExperienceOptions): StoryExperience {
  const tier = options.tier ?? QUALITY_TIERS[1]!
  const runtime = createSceneRuntime({ canvas: options.canvas, maxPixelRatio: tier.pixelRatio, antialias: false })
  const { renderer, loop, registry } = runtime
  applyColorPipeline(renderer, COLOR_PRESETS.cinematic)
  const environment = createGradientEnvironment(renderer, registry, { top: '#1b2140', horizon: '#f0b890', bottom: '#0a0a10', sun: { direction: new THREE.Vector3(-0.6, 0.35, 0.7), intensity: 10, size: 0.06 } })
  const makeSpace = (): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
    return { scene, camera }
  }
  const effects: { update(frame: { delta: number; elapsed: number }): void }[] = []

  // space 1: the monolith field, a tracking shot along a path
  const arrival = makeSpace()
  applyEnvironment(arrival.scene, environment.texture, { background: true, intensity: 0.8, backgroundIntensity: 0.5, backgroundBlurriness: 0.3 })
  arrival.scene.fog = new THREE.Fog('#2a2b3a', 10, 60)
  const monolith = createDisplacedStandardMaterial({ color: '#30323f', roughness: 0.55, metalness: 0.2 }, { amplitude: 0.06, frequency: 1.2, speed: options.reducedMotion ? 0 : 0.2 })
  registry.own(monolith.material, 'monolith')
  effects.push(monolith)
  const monolithGeometry = registry.own(new THREE.BoxGeometry(1.2, 6, 1.2, 4, 12, 4), 'monolith-geometry')
  const monoliths = new THREE.InstancedMesh(monolithGeometry, monolith.material, 64)
  const m = new THREE.Matrix4()
  for (let i = 0; i < 64; i++) {
    const t = i / 64
    const side = i % 2 === 0 ? -1 : 1
    const x = side * (4 + Math.sin(i * 1.7) * 2) + Math.sin(t * 9) * 1.5
    const z = -t * 70 + Math.cos(i * 2.3) * 2
    m.compose(new THREE.Vector3(x, 2.5 + Math.sin(i) * 0.8, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.6), new THREE.Vector3(1, 0.8 + (i % 5) * 0.2, 1))
    monoliths.setMatrixAt(i, m)
  }
  monoliths.instanceMatrix.needsUpdate = true
  arrival.scene.add(monoliths, new THREE.DirectionalLight('#ffd6b0', 2.5), new THREE.HemisphereLight('#8fa6d9', '#1a1510', 0.6))
  const ground = new THREE.Mesh(registry.own(new THREE.PlaneGeometry(80, 160), 'ground'), registry.own(createPhysicalMaterial('rubber', { color: '#15161c', roughness: 0.8 }), 'ground-material'))
  ground.rotation.x = -Math.PI / 2
  ground.position.z = -40
  arrival.scene.add(ground)
  const path = createPath([{ x: 0, y: 2, z: 6 }, { x: 1.5, y: 2.2, z: -8 }, { x: -1.5, y: 2.6, z: -22 }, { x: 0.5, y: 3, z: -38 }, { x: 0, y: 3.4, z: -52 }])
  const arrivalRig = createCameraRig(arrival.camera)
  const arrivalSteps = [0, 0.25, 0.5, 0.75, 1].map((u) => ({ shot: trackingShot(path, u, { lead: 0.04, fov: 42 + u * 6, roll: Math.sin(u * Math.PI) * 0.03 }), weight: 1 }))
  const arrivalSequence = createShotSequence(arrivalRig, arrivalSteps.map((s, i) => (i === 0 ? { shot: s.shot } : s)))

  // space 2: the hall, holographic pillars, a floor that dissolves out
  const hall = makeSpace()
  hall.scene.background = new THREE.Color('#06070c')
  applyEnvironment(hall.scene, environment.texture, { intensity: 0.4 })
  const holo = createHolographicMaterial({ color: '#4fd8ff', rimColor: '#ff7ad9', scanlines: 60 })
  holo.uniforms.uOpacity.value = 0.45 // ten additive pillars plus bloom: keep each one translucent or the hall whites out
  registry.own(holo.material, 'holo')
  effects.push(holo)
  const pillarGeometry = registry.own(new THREE.CylinderGeometry(0.35, 0.45, 9, 24, 1, true), 'pillar')
  for (let i = 0; i < 10; i++) {
    const pillar = new THREE.Mesh(pillarGeometry, holo.material)
    const angle = (i / 10) * Math.PI * 2
    pillar.position.set(Math.cos(angle) * 6, 4.5, Math.sin(angle) * 6)
    hall.scene.add(pillar)
  }
  const dissolve = createDissolveMaterial({ color: '#2b2d3a', edgeColor: '#ff9a3c', edgeWidth: 0.1, scale: 0.35 })
  registry.own(dissolve.material, 'dissolve-floor')
  const hallFloor = new THREE.Mesh(registry.own(new THREE.CircleGeometry(9, 64), 'hall-floor'), dissolve.material)
  hallFloor.rotation.x = -Math.PI / 2
  hall.scene.add(hallFloor, new THREE.PointLight('#8fb8ff', 6, 30))
  const hallRig = createCameraRig(hall.camera)
  const hallCentre = { x: 0, y: 3, z: 0 }
  const hallSequence = createShotSequence(hallRig, [{ shot: orbit(hallCentre, 11, 0.2, 0.25, { name: 'hall-wide', fov: 46 }) }, { shot: orbit(hallCentre, 7, 1.6, 0.1, { name: 'hall-orbit', fov: 40 }), weight: 1.5 }, { shot: orbit({ x: 0, y: 1, z: 0 }, 5, 2.6, 0.55, { name: 'hall-floor', fov: 36 }), weight: 1 }])

  // space 3: the artefact in a particle field, a slow push-in
  const artefact = makeSpace()
  artefact.scene.background = new THREE.Color('#0a0710')
  applyEnvironment(artefact.scene, environment.texture, { intensity: 1.2, rotationY: 2 })
  const iridescent = createIridescentMaterial({ baseColor: '#2a2433', thickness: 1.1, strength: 0.3 })
  registry.own(iridescent.material, 'iridescent')
  const relic = new THREE.Mesh(registry.own(new THREE.TorusKnotGeometry(1, 0.32, 200, 24, 3, 4), 'relic'), iridescent.material)
  relic.position.y = 1.5
  artefact.scene.add(relic, new THREE.DirectionalLight('#ffffff', 1.5))
  const dust = createInstancedField(registry, { count: 3000, formationA: sphereFormation(3000, 4), formationB: ringFormation(3000, 3, 1.5, 4), size: 0.018, color: '#8f7bbf' })
  dust.mesh.position.y = 1.5
  dust.uniforms.uFlow.value = options.reducedMotion ? 0 : 0.5
  artefact.scene.add(dust.mesh)
  const relicRig = createCameraRig(artefact.camera)
  const relicCentre = { x: 0, y: 1.5, z: 0 }
  const relicSequence = createShotSequence(relicRig, [{ shot: orbit(relicCentre, 10, -0.4, 0.2, { name: 'relic-far', fov: 40 }) }, { shot: orbit(relicCentre, 6.5, 0.5, 0.15, { name: 'relic-close', fov: 34 }), weight: 2 }, { shot: orbit(relicCentre, 5.4, 1.4, 0.45, { name: 'relic-detail', fov: 32 }), weight: 1 }])

  const spaces: Space[] = [
    { scene: arrival.scene, camera: arrival.camera, rig: arrivalRig, sequence: arrivalSequence, update: () => {} },
    { scene: hall.scene, camera: hall.camera, rig: hallRig, sequence: hallSequence, update: (_d, local) => { dissolve.uniforms.uProgress.value = smoothstep(0.55, 1, local) } },
    { scene: artefact.scene, camera: artefact.camera, rig: relicRig, sequence: relicSequence, update: (delta, local) => { dust.update(delta); dust.uniforms.uMorph.value = local; if (!options.reducedMotion) relic.rotation.y += delta * 0.15 } },
  ]

  // transitions, post, navigator, cues
  const transition = createSceneTransition(registry, { mode: 'iris', softness: 0.12 })
  runtime.onResize((w, h) => transition.setSize(w, h, renderer.getPixelRatio()))
  const post = createPostPipeline(runtime, { quality: tier.post, bloom: { strength: 0.3, threshold: 0.9 }, grain: { amount: 0.04, vignette: 0.4 } })
  const navigator = createChapterNavigator(STORY_CHAPTERS)
  const cues = createCueSheet()
  STORY_CHAPTERS.forEach((chapter, i) => {
    const end = STORY_CHAPTERS[i + 1]?.start ?? 1.01
    cues.add({ name: `caption:${chapter.id}`, start: chapter.start, end, enter: () => options.onCaption?.(chapter.id, true), leave: () => options.onCaption?.(chapter.id, false) })
  })
  const state = { progress: 0, space: 0, local: 0, fovScale: 1, transition: { active: false, mode: 'iris', progress: 0 } }

  // the render: one space, or two through the transition
  const view = (i: number) => ({ scene: spaces[i]!.scene, camera: spaces[i]!.camera })
  const previousRender = () => renderer.render(view(state.space).scene, view(state.space).camera)
  post.composer.passes[0]!.enabled = false // the RenderPass is replaced by our own first pass below
  runtime.setRender((frame) => {
    // write the scene (or the transition) into the composer's read buffer, then run the remaining passes
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(post.composer.readBuffer)
    renderer.clear()
    if (state.transition.active) {
      transition.progress = state.transition.progress
      transition.render(renderer, view(state.space), view(state.space + 1))
    } else previousRender()
    renderer.setRenderTarget(previous)
    post.render(frame.delta)
  })
  loop.add('animation', (frame) => {
    for (const e of effects) e.update(frame)
    spaces[state.space]?.update(frame.delta, state.local)
    if (state.transition.active) spaces[state.space + 1]?.update(frame.delta, 0)
  }, 'story-effects')

  const portrait = (w: number, h: number) => {
    state.fovScale = h > w ? 1.3 : 1
    for (const s of spaces) {
      s.camera.aspect = Math.max(0.1, w) / Math.max(0.1, h)
      s.camera.updateProjectionMatrix()
    }
  }
  runtime.onResize(portrait)

  const localOf = (p: number, i: number) => {
    const start = STORY_CHAPTERS[i]!.start
    const end = STORY_CHAPTERS[i + 1]?.start ?? 1
    return clamp01((p - start) / (end - start || 1))
  }
  const applyFov = (s: Space) => {
    const base = s.camera.fov
    s.camera.fov = base * state.fovScale
    s.camera.updateProjectionMatrix()
  }
  const seek = (progress: number): StoryDiagnostics => {
    const p = clamp01(progress)
    state.progress = p
    navigator.reportProgress(p)
    const index = navigator.index
    state.space = index
    state.local = localOf(p, index)
    const window = TRANSITIONS.find((t) => p >= t.from && p < t.to)
    if (window) {
      const from = TRANSITIONS.indexOf(window)
      state.space = from
      state.transition = { active: true, mode: window.mode, progress: clamp01((p - window.from) / (window.to - window.from)) }
      transition.mode = window.mode
      spaces[from]!.sequence.seek(1)
      spaces[from + 1]!.sequence.seek(0)
      applyFov(spaces[from]!)
      applyFov(spaces[from + 1]!)
    } else {
      state.transition = { active: false, mode: state.transition.mode, progress: p >= (TRANSITIONS[index - 1]?.to ?? 0) ? 1 : 0 }
      const s = spaces[index]!
      s.sequence.seek(state.local)
      applyFov(s)
    }
    cues.seek(p)
    return diagnostics()
  }
  const diagnostics = (): StoryDiagnostics => {
    const s = spaces[state.space]!
    return {
      progress: state.progress,
      chapter: { index: navigator.index, id: STORY_CHAPTERS[navigator.index]!.id },
      local: state.local,
      transition: { ...state.transition },
      camera: { space: state.space, x: s.camera.position.x, y: s.camera.position.y, z: s.camera.position.z, fov: s.camera.fov },
      fovScale: state.fovScale,
      cues: [...cues.active],
      dissolve: dissolve.uniforms.uProgress.value,
      reducedMotion: options.reducedMotion,
      stats: runtime.stats(),
    }
  }
  seek(0)
  runtime.start()
  return {
    navigator,
    cues,
    transitions: TRANSITIONS,
    seek,
    key: (k) => navigator.onKey(k),
    goTo: (i) => navigator.goTo(i),
    checkpoint(space, local) {
      const s = spaces[space]!
      const before = s.camera.position.clone()
      s.sequence.seek(local)
      const at = { x: s.camera.position.x, y: s.camera.position.y, z: s.camera.position.z }
      s.sequence.seek(space === state.space ? state.local : 0)
      s.camera.position.copy(before)
      return at
    },
    diagnostics,
    resetTiming: (options) => runtime.resetTiming(options),
    dispose() {
      cues.reset()
      post.dispose()
      transition.dispose()
      for (const s of spaces) s.rig.dispose()
      environment.dispose()
      // the spaces are separate scenes outside the runtime's own: dispose their graphs first, then the runtime
      for (const s of spaces) disposeSpace(s.scene)
      return runtime.dispose()
    },
  }
}

function disposeSpace(scene: THREE.Scene) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const mat of materials) mat.dispose()
  })
  scene.clear()
}
```

## 5. Mounting in Nuxt and Next

The page is the same in both frameworks: a tall scroll container with the canvas pinned at the top, captions and buttons in the DOM, the experience created on the client after mount and disposed on unmount. `bindScrollExperience` (a lab helper, `verification/shared-lab/bind-scroll.ts`) wires `ScrollTrigger` scrub to `api.seek`, keys to `api.key`, and the reduced-motion branch; the Vue and React wrappers are in the verification apps' harness (`/lab/product`, `/lab/field`, `/lab/story`). React Strict Mode mounts twice: both mounts create a complete experience and both unmounts dispose it (the lab asserts `mounts === disposes + 1` while mounted).

## 6. What the browser checks prove

`verification/browser/lab-checks.mjs` (pages `product`, `field`, `story`, in both apps): the camera lands on the documented shots at progress 0, at each segment start and at 1 (position within 1e-3 of the shot, fov equal); cues enter and leave at their boundaries; the configurator changes the collar colour and the derived roughness; explore mode moves the camera's ownership to the orbit controls and back; the particle field's read-back positions sit on formation A at progress 0 and on the emblem at progress 1, the pointer empties its radius, the density control changes the drawn count, draw calls stay at one per system; the story is in chapter 1 at 0.1, in a transition at 0.34 with the transition progress in (0, 1), in chapter 3 at 0.9, keys and buttons move chapters and return the progress to travel to, the dissolve uniform rises inside chapter 2, portrait viewports raise the fov scale; every page keeps running under `prefers-reduced-motion` with time-based motion frozen; re-entering a route recreates the experience with equal counts; disposal returns `renderer.info.memory` to the renderer's baseline; no console errors. Screenshots at three progress values per experience are saved as evidence for the human review of composition, lighting and materials, which no assertion replaces.

## 7. Lab pages

| Page | Experience | Checks |
|---|---|---|
| `/lab/shaders` | material and post-processing lab (`shader-engineering.md`) | compile, read-back, transitions, tiers, TSL |
| `/lab/particles` | particle lab (`gpu-particles.md`) | GPGPU correctness, CPU/GPU comparison, adaptive density, context loss |
| `/lab/product` | A, cinematic product | shots, cues, configurator, explore, dispose |
| `/lab/field` | B, GPU particles | formations, pointer, density, dispose |
| `/lab/story` | C, immersive story | chapters, transitions, keys, portrait, dispose |
