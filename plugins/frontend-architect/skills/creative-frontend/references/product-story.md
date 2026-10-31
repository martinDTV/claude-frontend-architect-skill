# Product story: the complete cinematic experience on an imported model

The fourth reference experience brings every module together on a real asset: the atelier speaker (a multi-part GLB from `asset-pipeline.md`, loaded through the cache with Draco and a plain fallback) in four chapters driven by scroll, keys and buttons. A studio hero on a turntable; a technical exploded view where the parts separate on a scrubbed GSAP timeline; a dust chapter where the solid parts dissolve through a custom shader while a GPGPU field reconstructs the product from scattered particles and settles on its surface, then gives it back; and a configurator with a colour tween, part selection by pointer and an explore mode. Captions, focus, lights and the chapter buttons follow the same progress. Mounted at `/lab/atelier` in both apps; `lab-checks.mjs` drives it.

## Contents

1. Structure and beats
2. The experience
3. What the browser checks prove
4. Decisions worth copying

## 1. Structure and beats

| Progress | Chapter | Camera | What moves | Technique |
|---|---|---|---|---|
| 0 – 0.28 | `hero` | establishing orbit, slow push | turntable (off under reduced motion), hover highlight | PBR from the file, studio environment, DOF on the product |
| 0.28 – 0.52 | `exploded` | higher, wider orbit | parts separate bottom to top as the scroll advances, labels | `buildExplodeTimeline` scrubbed by local progress |
| 0.52 – 0.78 | `dust` | close push-in | parts dissolve while particles gather on the product's surface, then the particles scatter and the parts return | dissolve `ShaderMaterial` per part + GPGPU formation sampled from the model's meshes |
| 0.78 – 1 | `choose` | reverse orbit | finish and colour, part selection, explore mode | configurator state machine, GSAP colour tween, controls bridge |

Transitions between chapters are camera moves inside one space (no scene transition: one product, one studio), which keeps the product legible throughout; the dust chapter is where the experience earns its ambition and it is scrubbable and reversible like the rest.

## 2. The experience

```ts
// @verify creative:experiences/atelier-experience.ts nuxt:lib/lab/experiences/atelier-experience.ts next:lib/lab/experiences/atelier-experience.ts
import * as THREE from 'three'
import { createSceneRuntime, type DisposalReport, type SceneRuntime } from '../engine/scene-runtime'
import { driveGsapFromLoop, type GsapClockHost } from '../engine/gsap-clock'
import { createCameraRig, orbit, type Shot } from '../cinematic/camera-rig'
import { createShotSequence, type ShotSequence } from '../cinematic/sequence'
import { createCueSheet, type CueSheet } from '../cinematic/cues'
import { clamp01, smoothstep } from '../cinematic/interpolation'
import { createPostPipeline, type PostPipeline } from '../shaders/post/pipeline'
import { createDissolveMaterial } from '../shaders/materials'
import { applyColorPipeline, COLOR_PRESETS } from '../rendering/color'
import { applyEnvironment, createGradientEnvironment } from '../rendering/environment'
import { createPhysicalMaterial } from '../rendering/materials'
import { configureShadows, fitShadowCamera } from '../rendering/shadows'
import { QUALITY_TIERS, type QualityTier } from '../rendering/quality'
import { createChapterNavigator, type ChapterNavigator } from '../interaction/chapters'
import { createConfigurator, type Configurator } from '../interaction/configurator'
import { createControlsBridge, type ControlsBridge } from '../interaction/controls'
import { createPointerTracker } from '../interaction/pointer'
import { createRayPicker } from '../interaction/picking'
import { createAssetCache, type AssetCache, type ModelHandle, type ModelInstance } from '../assets/asset-cache'
import { createLoaders } from '../assets/loaders'
import { sphereFormation, surfaceFormation } from '../particles/formations'
import { createGpgpuSimulation, type GpgpuSimulation } from '../particles/gpgpu-simulation'
import { applyHighlight, buildExplodeTimeline, createPartsState, isAtelierPart, type AtelierPart, type PartsState, type TimelineLike } from './atelier-parts'

export const ATELIER_CHAPTERS = [
  { id: 'hero', title: 'Atelier', start: 0 },
  { id: 'exploded', title: 'Every part', start: 0.28 },
  { id: 'dust', title: 'Made of light', start: 0.52 },
  { id: 'choose', title: 'Yours', start: 0.78 },
]
export const ATELIER_FINISHES: Record<string, { color: string; roughness: number; metalness: number }> = {
  graphite: { color: '#1f232c', roughness: 0.35, metalness: 0.9 },
  oxblood: { color: '#5a1620', roughness: 0.4, metalness: 0.6 },
  sand: { color: '#c8b08a', roughness: 0.55, metalness: 0.2 },
}
export type AtelierSelection = { finish: string; grille: string }

export interface AtelierExperienceOptions {
  canvas: HTMLCanvasElement
  controlsElement: HTMLElement
  reducedMotion: boolean
  tier?: QualityTier
  gsap: GsapClockHost & { timeline(vars?: object): TimelineLike; to(target: object, vars: object): unknown }
  /** format fallback chain, first that loads wins */
  modelUrls?: string[]
  decoders?: { dracoPath?: string; ktx2Path?: string }
  onCaption?: (id: string, active: boolean) => void
}

export interface AtelierDiagnostics {
  loaded: boolean
  model: { url: string; bytes: number; parts: string[]; triangles: number; fetchMs: number; parseMs: number } | null
  progress: number
  chapter: { index: number; id: string }
  local: number
  shot: { index: number; name: string }
  camera: { x: number; y: number; z: number; fov: number }
  cues: string[]
  explode: number
  dissolve: number
  particles: { morph: number; curl: number; drawn: number; count: number; side: number }
  positions: Record<string, { x: number; y: number; z: number }>
  hovered: string | null
  selected: string | null
  selection: AtelierSelection
  paintColor: string
  exploring: boolean
  owners: Record<string, string>
  fovScale: number
  turntable: number
  reducedMotion: boolean
  tier: string
  stats: ReturnType<SceneRuntime['stats']>
}

export interface AtelierExperience {
  readonly navigator: ChapterNavigator
  readonly sequence: ShotSequence
  readonly cues: CueSheet
  readonly configurator: Configurator<AtelierSelection>
  readonly post: PostPipeline
  readonly ready: Promise<void>
  seek(progress: number): AtelierDiagnostics
  key(key: string): number | null
  goTo(index: number): number
  explore(): void
  resume(): void
  hover(part: AtelierPart | null): void
  select(part: AtelierPart | null): void
  screenPositionOf(part: AtelierPart): { x: number; y: number } | null
  /** mean distance of the live particles to the model's surface (read-back; tests) */
  particleDistanceToSurface(): number
  /** advance the simulation by fixed steps (tests, warm start) */
  advance(seconds: number): void
  diagnostics(): AtelierDiagnostics
  dispose(): DisposalReport | null
}

const SIDE = 96 // 9,216 particles: enough to read as the product's surface, light enough for the software renderer

export function createAtelierExperience(options: AtelierExperienceOptions): AtelierExperience {
  const tier = options.tier ?? QUALITY_TIERS[2]!
  const runtime = createSceneRuntime({ canvas: options.canvas, maxPixelRatio: tier.pixelRatio, antialias: false })
  const { renderer, scene, camera, loop, registry } = runtime
  applyColorPipeline(renderer, { ...COLOR_PRESETS.product, exposure: 0.85 })
  const restoreGsap = driveGsapFromLoop(loop, options.gsap)

  // studio
  const environment = createGradientEnvironment(renderer, registry, { top: '#1d2436', horizon: '#cdbca4', bottom: '#0e0e12', sun: { direction: new THREE.Vector3(0.45, 0.65, 0.5), intensity: 4.5, size: 0.05 } })
  applyEnvironment(scene, environment.texture, { intensity: 0.65, rotationY: 0.5 })
  scene.background = new THREE.Color('#0d0e13')
  const key = new THREE.DirectionalLight('#fff0dc', 2.4)
  key.position.set(3.5, 5, 4)
  const fill = new THREE.HemisphereLight('#9fb4d8', '#15120f', 0.45)
  const rim = new THREE.DirectionalLight('#dfe8ff', 1.3)
  rim.position.set(-4, 3.5, -5)
  scene.add(key, key.target, fill, rim)
  const floor = new THREE.Mesh(registry.own(new THREE.CircleGeometry(12, 64), 'floor'), registry.own(createPhysicalMaterial('ceramic', { color: '#0a0a0e', roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 }), 'floor-material'))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // the product arrives through the cache (Draco first, plain as the fallback)
  const stage = new THREE.Group() // turntable
  scene.add(stage)
  const loaders = createLoaders({ dracoPath: options.decoders?.dracoPath ?? '/draco/', ktx2Path: options.decoders?.ktx2Path ?? '/basis/', renderer })
  const cache: AssetCache = createAssetCache({ loaders, registry })
  let handle: ModelHandle | null = null
  let instance: ModelInstance | null = null
  let explodeTimeline: TimelineLike | null = null
  let simulation: GpgpuSimulation | null = null
  const dissolve = new Map<string, { material: THREE.ShaderMaterial; uniforms: { uProgress: { value: number } }; original: THREE.Material }>()
  let surfaceStore = new Float32Array(0) // the sampled surface, kept for the read-back comparison
  const parts: PartsState = createPartsState()
  const centre = { x: 0, y: 0.7, z: 0 }
  const paint = { color: new THREE.Color(ATELIER_FINISHES.graphite!.color) }

  const build = async () => {
    handle = await cache.loadFirst(options.modelUrls ?? ['/models/atelier.draco.glb', '/models/atelier.glb'])
    instance = handle.instantiate({ ownMaterials: true })
    instance.root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    stage.add(instance.root)
    if (tier.shadows) {
      configureShadows(renderer, key, { mapSize: tier.shadowMapSize })
      fitShadowCamera(key, new THREE.Box3().setFromObject(instance.root), 0.8)
    }
    // the exploded view, scrubbed by chapter 2's local progress
    explodeTimeline = buildExplodeTimeline(options.gsap, new Map<string, THREE.Object3D>(instance.parts), { duration: 1, stagger: 0.08 })
    // dissolve materials per part, swapped in during the dust chapter
    for (const [name, mesh] of instance.parts) {
      const original = mesh.material as THREE.MeshStandardMaterial
      const effect = createDissolveMaterial({ color: original.color.getHex(), edgeColor: '#ffb86b', edgeWidth: 0.1, scale: 6 })
      registry.own(effect.material, `dissolve-${name}`)
      dissolve.set(name, { material: effect.material, uniforms: effect.uniforms, original })
    }
    // particles: scattered cloud → the product's surface (sampled from the meshes in the stage's frame)
    const count = SIDE * SIDE
    instance.root.updateMatrixWorld(true)
    const meshes = [...instance.parts.values()]
    const totalTriangles = meshes.reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3, 0)
    const surface = new Float32Array(count * 3)
    let offset = 0
    const v = new THREE.Vector3()
    // the particles are children of the stage (the turntable): sample in the stage's frame, not in world space
    stage.updateMatrixWorld(true)
    const toStage = stage.matrixWorld.clone().invert()
    const partToStage = new THREE.Matrix4()
    meshes.forEach((mesh, i) => {
      const triangles = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute('position').count) / 3
      const share = i === meshes.length - 1 ? count - offset : Math.floor((count * triangles) / totalTriangles)
      const local = surfaceFormation(mesh, share, 23 + i)
      partToStage.multiplyMatrices(toStage, mesh.matrixWorld)
      for (let k = 0; k < share; k++) {
        v.set(local[k * 3]!, local[k * 3 + 1]!, local[k * 3 + 2]!).applyMatrix4(partToStage)
        surface[(offset + k) * 3] = v.x
        surface[(offset + k) * 3 + 1] = v.y
        surface[(offset + k) * 3 + 2] = v.z
      }
      offset += share
    })
    surfaceStore = surface
    const cloud = sphereFormation(count, 2.6).map((x, i) => x + (i % 3 === 1 ? 0.9 : 0))
    simulation = createGpgpuSimulation(renderer, registry, { side: SIDE, formationA: cloud, formationB: surface, colorSlow: '#8fb4ff', colorFast: '#ffd9a0', pointSize: 0.085 })
    simulation.velocity.uAttraction.value = 6
    simulation.velocity.uCurl.value = options.reducedMotion ? 0 : 0.25
    simulation.points.visible = false
    stage.add(simulation.points)
    parts.subscribe(() => { for (const [name, mesh] of instance!.parts) if (isAtelierPart(name)) applyHighlight(mesh, parts.stateOf(name)) })
    applyFinish(configurator.derived, false)
    seek(state.progress)
  }
  const ready = build()

  // camera and cues
  const shots: Shot[] = [
    orbit(centre, 4.6, 0.5, 0.18, { name: 'hero', fov: 34 }),
    orbit({ x: 0, y: 1.05, z: 0 }, 6.6, 1.1, 0.36, { name: 'exploded', fov: 40 }),
    orbit({ x: 0, y: 0.75, z: 0 }, 3.4, -0.6, 0.12, { name: 'dust', fov: 32 }),
    orbit(centre, 4.2, 2.9, 0.22, { name: 'choose', fov: 36 }),
  ]
  const rig = createCameraRig(camera, loop)
  const sequence = createShotSequence(rig, [{ shot: shots[0]!, hold: 0.9 }, { shot: shots[1]!, weight: 0.5, hold: 0.9 }, { shot: shots[2]!, weight: 0.5, hold: 1 }, { shot: shots[3]!, weight: 0.5, hold: 0.6 }])
  const post = createPostPipeline(runtime, { quality: tier.post, bloom: { strength: 0.22, threshold: 1 }, dof: { focus: 4.6, aperture: 0.00025, maxblur: 0.008 }, grain: { amount: 0.03, vignette: 0.3 } })
  const navigator = createChapterNavigator(ATELIER_CHAPTERS)
  const cues = createCueSheet()
  const state = { progress: 0, explode: 0, dissolveProgress: 0, fovScale: 1, turntable: 0 }
  ATELIER_CHAPTERS.forEach((chapter, i) => {
    const end = ATELIER_CHAPTERS[i + 1]?.start ?? 1.01
    cues.add({ name: `caption:${chapter.id}`, start: chapter.start, end, enter: () => options.onCaption?.(chapter.id, true), leave: () => options.onCaption?.(chapter.id, false) })
    const shot = shots[i]!
    const distance = Math.hypot(shot.position.x - shot.target.x, shot.position.y - shot.target.y, shot.position.z - shot.target.z)
    cues.add({ name: `focus:${chapter.id}`, start: chapter.start, end, enter: () => post.focus(distance) })
  })
  cues.add({ name: 'light:dust', start: 0.52, end: 0.78, update: (t) => { key.intensity = 2.4 - 1.6 * Math.sin(Math.PI * t); fill.intensity = 0.45 + 0.4 * Math.sin(Math.PI * t) }, leave: () => { key.intensity = 2.4; fill.intensity = 0.45 } })

  // configurator: finish applies to the painted body, grille choice to the grille material
  const configurator = createConfigurator<AtelierSelection>({
    options: [
      { id: 'finish', label: 'Finish', values: Object.keys(ATELIER_FINISHES).map((id) => ({ id, label: id })), default: 'graphite' },
      { id: 'grille', label: 'Grille', values: [{ id: 'woven', label: 'Woven' }, { id: 'steel', label: 'Steel' }], default: 'woven' },
    ],
    derive: (s) => ({ ...ATELIER_FINISHES[s.finish]!, grilleColor: s.grille === 'steel' ? '#9ea4ad' : '#bfb6a8', grilleRoughness: s.grille === 'steel' ? 0.3 : 0.55 }),
  })
  const applyFinish = (derived: Record<string, unknown>, animate: boolean) => {
    const body = instance?.parts.get('body')?.material as THREE.MeshStandardMaterial | undefined
    const grille = instance?.parts.get('grille')?.material as THREE.MeshStandardMaterial | undefined
    const target = new THREE.Color(String(derived.color))
    paint.color.copy(target)
    if (body) {
      body.roughness = Number(derived.roughness)
      body.metalness = Number(derived.metalness)
      if (animate && !options.reducedMotion) options.gsap.to(body.color, { r: target.r, g: target.g, b: target.b, duration: 0.8, ease: 'power2.out' })
      else body.color.copy(target)
      const d = dissolve.get('body')
      if (d) (d.material.uniforms.uColor as { value: THREE.Color }).value.copy(target)
    }
    if (grille) {
      grille.color.set(String(derived.grilleColor))
      grille.roughness = Number(derived.grilleRoughness)
    }
  }
  configurator.subscribe((change) => applyFinish(change.derived, true))

  // interaction: pointer for the particles and picking for the parts, keyboard through the page
  const pointer = createPointerTracker(options.controlsElement, { plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0) })
  const picker = createRayPicker([stage], { intervalMs: 50, onEnter: (o) => { if (isAtelierPart(o.name)) parts.hover(o.name) }, onLeave: () => parts.hover(null) })
  const onClick = () => { if (parts.hovered) parts.select(parts.hovered) }
  options.controlsElement.addEventListener('click', onClick)
  loop.add('input', () => {
    const p = pointer.update(camera)
    if (simulation) {
      if (p.active && !options.reducedMotion && simulation.points.visible) simulation.velocity.uPointer.value.copy(p.world)
      else simulation.velocity.uPointer.value.set(1e3, 1e3, 1e3)
    }
    if (p.active && instance && navigator.index !== 2) picker.hover(picker.pick(camera, p.ndc.x, p.ndc.y))
    else picker.hover(null)
  }, 'atelier-input')
  loop.add('animation', (frame) => {
    if (!options.reducedMotion && (navigator.index === 0 || navigator.index === 3) && !bridge?.exploring) {
      state.turntable += frame.delta * 0.25
      stage.rotation.y = state.turntable
    }
  }, 'turntable')
  loop.add('simulation', (frame) => { if (simulation?.points.visible) simulation.compute(frame.delta) }, 'atelier-particles')

  let bridge: ControlsBridge | null = null
  const localOf = (p: number, i: number) => {
    const start = ATELIER_CHAPTERS[i]!.start
    const end = ATELIER_CHAPTERS[i + 1]?.start ?? 1
    return clamp01((p - start) / (end - start || 1))
  }
  const applyDust = (local: number) => {
    // 0 → 0.5: the parts dissolve while the particles gather on the surface; 0.5 → 1: particles scatter, parts return
    const gather = smoothstep(0.05, 0.5, local)
    const release = smoothstep(0.55, 1, local)
    state.dissolveProgress = gather * (1 - release)
    if (simulation) {
      const morph = gather * (1 - release)
      simulation.velocity.uMorph.value = morph
      // turbulence while the dust travels between the cloud and the surface; calm once it has gathered
      simulation.velocity.uCurl.value = options.reducedMotion ? 0 : 0.25 + 2.5 * (1 - Math.abs(2 * morph - 1))
      simulation.points.visible = local > 0 && local < 1
    }
    if (instance) {
      for (const [name, mesh] of instance.parts) {
        const d = dissolve.get(name)
        if (!d) continue
        const dissolving = state.dissolveProgress > 0.001
        mesh.material = dissolving ? d.material : d.original
        d.uniforms.uProgress.value = state.dissolveProgress
      }
    }
  }
  const seek = (progress: number): AtelierDiagnostics => {
    if (bridge?.exploring) return diagnostics()
    const p = clamp01(progress)
    state.progress = p
    navigator.reportProgress(p)
    const index = navigator.index
    const local = localOf(p, index)
    sequence.seek(p)
    cues.seek(p)
    // chapter 2: explode by local progress; chapters after it keep the product exploded until the dust rebuilds it
    // chapter 2 explodes by local progress; the dust chapter brings the parts back as it releases them; later chapters are assembled
    state.explode = index === 1 ? smoothstep(0, 0.85, local) : index === 2 ? 1 - smoothstep(0.55, 1, local) : 0
    explodeTimeline?.progress(state.explode)
    applyDust(index === 2 ? local : index > 2 ? 1 : 0)
    camera.fov = camera.fov * state.fovScale
    camera.updateProjectionMatrix()
    return diagnostics()
  }
  runtime.onResize((w, h) => { state.fovScale = h > w ? 1.3 : 1 })

  const diagnostics = (): AtelierDiagnostics => {
    const positions: AtelierDiagnostics['positions'] = {}
    if (instance) for (const [name, mesh] of instance.parts) positions[name] = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }
    return {
      loaded: Boolean(instance),
      model: handle ? { url: handle.asset.url, bytes: handle.asset.stats.bytes, parts: [...(instance?.parts.keys() ?? [])], triangles: handle.asset.stats.triangles, fetchMs: handle.asset.timings.fetchMs, parseMs: handle.asset.timings.parseMs } : null,
      progress: state.progress,
      chapter: { index: navigator.index, id: ATELIER_CHAPTERS[navigator.index]!.id },
      local: localOf(state.progress, navigator.index),
      shot: { index: sequence.state.segment, name: sequence.state.name },
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov },
      cues: [...cues.active],
      explode: state.explode,
      dissolve: state.dissolveProgress,
      particles: { morph: simulation?.velocity.uMorph.value ?? 0, curl: simulation?.velocity.uCurl.value ?? 0, drawn: simulation?.drawn ?? 0, count: simulation?.count ?? 0, side: SIDE },
      positions,
      hovered: parts.hovered,
      selected: parts.selected,
      selection: configurator.selection,
      paintColor: `#${paint.color.getHexString()}`,
      exploring: bridge?.exploring ?? false,
      owners: Object.fromEntries(loop.owners()),
      fovScale: state.fovScale,
      turntable: state.turntable,
      reducedMotion: options.reducedMotion,
      tier: tier.name,
      stats: runtime.stats(),
    }
  }
  sequence.seek(0)
  cues.seek(0)
  runtime.start()

  return {
    navigator,
    sequence,
    cues,
    configurator,
    post,
    ready,
    seek,
    key: (k) => navigator.onKey(k),
    goTo: (i) => navigator.goTo(i),
    explore() {
      bridge ??= createControlsBridge(loop, camera, options.controlsElement, rig, { target: new THREE.Vector3(centre.x, centre.y, centre.z), reducedMotion: options.reducedMotion, minDistance: 1.8, maxDistance: 10 })
      bridge.explore()
    },
    resume: () => bridge?.resume(),
    hover: (part) => parts.hover(part),
    select: (part) => parts.select(part),
    screenPositionOf(part) {
      const mesh = instance?.parts.get(part)
      if (!mesh) return null
      const v = mesh.getWorldPosition(new THREE.Vector3()).project(camera)
      const rect = options.canvas.getBoundingClientRect()
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height }
    },
    particleDistanceToSurface() {
      if (!simulation) return Number.NaN
      const data = simulation.readPositions()
      const surface = surfaceStore
      let sum = 0
      const n = simulation.drawn
      for (let i = 0; i < n; i++) sum += Math.hypot((data[i * 4] ?? 0) - (surface[i * 3] ?? 0), (data[i * 4 + 1] ?? 0) - (surface[i * 3 + 1] ?? 0), (data[i * 4 + 2] ?? 0) - (surface[i * 3 + 2] ?? 0))
      return sum / Math.max(1, n)
    },
    advance(seconds) {
      const steps = Math.round(seconds * 60)
      for (let i = 0; i < steps; i++) simulation?.compute(1 / 60)
    },
    diagnostics,
    dispose() {
      cues.reset()
      options.controlsElement.removeEventListener('click', onClick)
      pointer.dispose()
      picker.dispose()
      bridge?.dispose()
      post.dispose()
      rig.dispose()
      explodeTimeline?.kill()
      if (simulation) {
        stage.remove(simulation.points)
        simulation.dispose()
      }
      if (instance) {
        stage.remove(instance.root)
        instance.dispose()
      }
      handle?.release()
      cache.dispose()
      environment.dispose()
      key.shadow.dispose()
      restoreGsap()
      return runtime.dispose()
    },
  }
}
```

## 3. What the browser checks prove

`atelier` in `lab-checks.mjs`, both apps: the model arrives through the Draco variant (url, bytes and six parts in the diagnostics); at 0.1 the hero shot and caption; at 0.5 the exploded view at progress 1 with the parts displaced by the documented offsets; at 0.6 the dissolve above 0.9 while the particles are visible with morph near 1 and a read-back mean distance to the sampled surface under 0.25 after a few seconds of simulation; at 0.78 the parts are back and solid, dissolve 0; at 0.95 the choose chapter, a finish change recolours the body through a tween and the grille option changes its material; hover over the projected cap through the page's pointer and a click selects it; explore mode pauses the scrub and hands the camera over; keys and buttons move chapters with one announced change per travel; portrait raises the fov scale; the usual tail (scroll scrub, screenshots with caption contrast, disposal to the baseline including the cache, re-entry counts, reduced motion with cuts and no turntable).

## 4. Decisions worth copying

- **One space, four chapters**: camera moves carry the structure; scene transitions were not needed and would have cost the product's continuity.
- **The dust chapter is a function of local progress** like everything else: dissolve, morph and turbulence derive from one number, so it scrubs, reverses and cuts under reduced motion without special cases.
- **Particles sample the real mesh**: the formation comes from the loaded geometry in the stage's frame, so a different model changes the reconstruction without a line of code.
- **Own materials per instance** make highlights and the configurator free of side effects on the cached master; the dissolve materials are own resources swapped in and out, never recompiled per frame.
- **Fallback chain in the cache**: Draco first, plain second; a missing decoder is an error kind, not a blank canvas.
