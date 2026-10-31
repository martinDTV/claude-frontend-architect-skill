/**
 * Shader lab: compiles and renders every GLSL material, the mask transition and the post pipeline on a WebGLRenderer,
 * and the TSL node materials on a WebGPURenderer forced to its WebGL 2 backend. Exposes what it measured on
 * `window.__lab` for verification/browser/lab-checks.mjs. Mounted by /lab/shaders in the Nuxt and Next apps.
 */
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { createSceneRuntime, type SceneRuntime } from '../engine/scene-runtime'
import { disposeSceneGraph } from '../engine/dispose-graph'
import { createSceneTransition } from '../cinematic/scene-transition'
import { TRANSITION_MODES } from '../shaders/glsl/transitions'
import { createDisplacedMaterial, createDisplacedStandardMaterial, createDissolveMaterial, createHolographicMaterial, createImageTransitionMaterial, createIridescentMaterial, createRefractionMaterial, type ShaderEffect } from '../shaders/materials'
import { POST_QUALITIES, createPostPipeline } from '../shaders/post/pipeline'
import { createDissolveNodeMaterial, createHolographicNodeMaterial, createIridescentNodeMaterial } from '../shaders/tsl/materials'
import type { UniformValue } from '../shaders/uniforms'

export interface MaterialProbe {
  name: string
  /** fraction of covered pixels (alpha > 0) in a 64×64 render of a sphere with the material */
  coverage: number
  /** the mean colour of the covered pixels; two probes of one material at different uniform values must differ */
  mean: [number, number, number]
}
export interface ShaderLabDiagnostics {
  ready: boolean
  errors: string[]
  programs: { total: number; runnable: number; failed: string[] }
  materials: MaterialProbe[]
  dissolve: { atZero: number; atOne: number; atHalf: number }
  transitions: { mode: string; atZero: [number, number, number]; atOne: [number, number, number]; atHalf: [number, number, number] }[]
  post: { tier: string; width: number; height: number; passes: number; rendered: boolean }[]
  tsl: { backend: string; materials: { name: string; coverage: number }[]; error: string | null }
  runtime: ReturnType<SceneRuntime['stats']> | null
  disposed: boolean
  /**
   * textures the renderer allocates for itself the first time it renders a lit built-in material (placeholder
   * samplers), measured before the lab creates anything: they live as long as the context and are not scene resources
   */
  rendererBaseline: { textures: number; geometries: number }
  /** renderer.info.memory after each disposal step: the post pipeline, then the runtime (scene graph, registry, renderer) */
  afterDispose: { geometries: number; textures: number; afterPost: { geometries: number; textures: number }; beforeDispose: { geometries: number; textures: number } } | null
  /** renderer.info.memory after each disposal step, to locate anything that survives */
  disposeTrace: { step: string; geometries: number; textures: number }[]
}

declare global {
  interface Window {
    __lab?: unknown
  }
}

const SIZE = 64

export async function mountShaderLab(canvas: HTMLCanvasElement, tslCanvas: HTMLCanvasElement): Promise<{ diagnostics: ShaderLabDiagnostics; dispose: () => void }> {
  const diagnostics: ShaderLabDiagnostics = { ready: false, errors: [], programs: { total: 0, runnable: 0, failed: [] }, materials: [], dissolve: { atZero: 0, atOne: 0, atHalf: 0 }, transitions: [], post: [], tsl: { backend: 'none', materials: [], error: null }, runtime: null, disposed: false, rendererBaseline: { textures: 0, geometries: 0 }, afterDispose: null, disposeTrace: [] }
  window.__lab = diagnostics
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    diagnostics.errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ').slice(0, 300))
    originalError.apply(console, args)
  }

  const runtime = createSceneRuntime({ canvas, maxPixelRatio: 1, alpha: true })
  const { renderer, registry } = runtime
  const memory = () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures })
  const mark = (step: string) => diagnostics.disposeTrace.push({ step, ...memory() })
  mark('runtime')
  const probeTarget = registry.own(new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.UnsignedByteType }), 'probe-target')
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  const probeCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 50)
  probeCamera.position.set(0, 0, 4)
  probeCamera.lookAt(0, 0, 0)
  const sphere = registry.own(new THREE.SphereGeometry(1, 48, 32), 'probe-sphere')
  const plane = registry.own(new THREE.PlaneGeometry(2.4, 2.4), 'probe-plane')
  {
    // renderer baseline: a lit MeshStandardMaterial rendered to the canvas once, then disposed with its geometry;
    // whatever stays in renderer.info is the renderer's own (its empty-sampler placeholders), not ours
    const geometry = new THREE.BoxGeometry()
    const material = new THREE.MeshStandardMaterial()
    const scene = new THREE.Scene()
    scene.add(new THREE.Mesh(geometry, material), new THREE.DirectionalLight(0xffffff, 1))
    renderer.render(scene, probeCamera)
    geometry.dispose()
    material.dispose()
    diagnostics.rendererBaseline = { textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }
    mark('renderer-baseline')
  }

  const readProbe = (scene: THREE.Scene, camera: THREE.Camera = probeCamera): { coverage: number; mean: [number, number, number] } => {
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(probeTarget)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.readRenderTargetPixels(probeTarget, 0, 0, SIZE, SIZE, pixels)
    renderer.setRenderTarget(previous)
    let covered = 0
    const sum: [number, number, number] = [0, 0, 0]
    for (let i = 0; i < pixels.length; i += 4) {
      if ((pixels[i + 3] ?? 0) === 0) continue
      covered++
      sum[0] += pixels[i] ?? 0
      sum[1] += pixels[i + 1] ?? 0
      sum[2] += pixels[i + 2] ?? 0
    }
    const n = Math.max(1, covered)
    return { coverage: covered / (SIZE * SIZE), mean: [sum[0] / n, sum[1] / n, sum[2] / n] }
  }
  const probeScene = (object: THREE.Object3D) => {
    const scene = new THREE.Scene()
    scene.add(object)
    return scene
  }

  // 1. GLSL materials, each rendered alone on a sphere
  const checker = registry.own(new THREE.DataTexture(new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255, 255, 0, 0, 255]), 2, 2), 'checker')
  checker.needsUpdate = true
  const backdrop = registry.own(new THREE.DataTexture(new Uint8Array([0, 255, 0, 255, 255, 255, 0, 255, 255, 255, 0, 255, 0, 255, 0, 255]), 2, 2), 'backdrop')
  backdrop.needsUpdate = true
  const effects: { name: string; effect: ShaderEffect<Record<string, UniformValue>>; geometry: THREE.BufferGeometry }[] = [
    { name: 'dissolve', effect: createDissolveMaterial(), geometry: sphere },
    { name: 'holographic', effect: createHolographicMaterial(), geometry: sphere },
    { name: 'iridescent', effect: createIridescentMaterial(), geometry: sphere },
    { name: 'refraction', effect: createRefractionMaterial(backdrop), geometry: sphere },
    { name: 'image-transition', effect: createImageTransitionMaterial(checker, backdrop), geometry: plane },
    { name: 'displaced', effect: createDisplacedMaterial(), geometry: sphere },
  ]
  const displacedStandard = createDisplacedStandardMaterial({ color: '#c0c0c0', roughness: 0.4, metalness: 0.2 })
  for (const { name, effect, geometry } of effects) {
    registry.own(effect.material, `material-${name}`)
    if ('uResolution' in effect.uniforms) (effect.uniforms.uResolution as { value: THREE.Vector2 }).value.set(SIZE, SIZE)
    effect.update({ delta: 0.3, elapsed: 0.3 })
    const probe = readProbe(probeScene(new THREE.Mesh(geometry, effect.material)))
    diagnostics.materials.push({ name, ...probe })
    mark(`probe-${name}`)
  }
  {
    registry.own(displacedStandard.material, 'material-displaced-standard')
    const lit = probeScene(new THREE.Mesh(sphere, displacedStandard.material))
    lit.add(new THREE.DirectionalLight(0xffffff, 2), new THREE.AmbientLight(0xffffff, 0.4))
    displacedStandard.update({ delta: 0.3, elapsed: 0.3 })
    diagnostics.materials.push({ name: 'displaced-standard', ...readProbe(lit) })
    mark('probe-displaced-standard')
  }
  // dissolve sweeps from everything to nothing
  const dissolve = effects[0]!.effect
  const dissolveScene = probeScene(new THREE.Mesh(sphere, dissolve.material))
  dissolve.uniforms.uProgress!.value = 0
  diagnostics.dissolve.atZero = readProbe(dissolveScene).coverage
  dissolve.uniforms.uProgress!.value = 0.5
  diagnostics.dissolve.atHalf = readProbe(dissolveScene).coverage
  dissolve.uniforms.uProgress!.value = 1
  diagnostics.dissolve.atOne = readProbe(dissolveScene).coverage
  mark('dissolve-sweep')

  // 2. mask transitions between a red and a blue scene, every mode at 0, 0.5 and 1
  const solid = (hex: number) => {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(hex)
    return { scene, camera: probeCamera }
  }
  const red = solid(0xff0000)
  const blue = solid(0x0000ff)
  const transition = createSceneTransition(registry)
  transition.setSize(SIZE, SIZE, 1)
  for (const mode of TRANSITION_MODES) {
    transition.mode = mode
    const sample = (p: number): [number, number, number] => {
      transition.progress = p
      renderer.setRenderTarget(probeTarget)
      transition.render(renderer, red, blue)
      renderer.readRenderTargetPixels(probeTarget, 0, 0, SIZE, SIZE, pixels)
      renderer.setRenderTarget(null)
      const sum: [number, number, number] = [0, 0, 0]
      for (let i = 0; i < pixels.length; i += 4) {
        sum[0] += pixels[i] ?? 0
        sum[1] += pixels[i + 1] ?? 0
        sum[2] += pixels[i + 2] ?? 0
      }
      const n = SIZE * SIZE
      return [sum[0] / n, sum[1] / n, sum[2] / n]
    }
    diagnostics.transitions.push({ mode, atZero: sample(0), atHalf: sample(0.5), atOne: sample(1) })
  }
  transition.dispose()
  mark('transitions')

  // 3. the post pipeline at every tier, on the visible canvas
  const stage = runtime.scene
  stage.background = new THREE.Color('#0b0b12')
  const hero = new THREE.Mesh(sphere, effects[2]!.effect.material)
  stage.add(hero, new THREE.DirectionalLight(0xffffff, 2))
  runtime.camera.position.set(0, 0, 4)
  runtime.camera.lookAt(0, 0, 0)
  mark('before-post')
  const post = createPostPipeline(runtime, { quality: POST_QUALITIES.cinematic })
  mark('post-created')
  for (const tier of Object.values(POST_QUALITIES)) {
    const before = diagnostics.errors.length
    post.setQuality(tier)
    post.render(1 / 60)
    mark(`tier-${tier.name}`)
    const rt = post.composer.renderTarget1
    diagnostics.post.push({ tier: tier.name, width: rt.width, height: rt.height, passes: post.composer.passes.filter((p) => p.enabled).length, rendered: diagnostics.errors.length === before })
  }
  post.setQuality(POST_QUALITIES.balanced)
  runtime.start()

  // 4. program health on the WebGLRenderer
  const programs = renderer.info.programs ?? []
  const failed = programs.filter((p) => (p as { diagnostics?: { runnable: boolean } }).diagnostics && !(p as { diagnostics?: { runnable: boolean } }).diagnostics!.runnable)
  diagnostics.programs = { total: programs.length, runnable: programs.length - failed.length, failed: failed.map((p) => (p as { name?: string }).name ?? 'unknown') }

  // 5. TSL node materials on WebGPURenderer, WebGL 2 backend
  let tsl: WebGPURenderer | null = null
  let tslRow: THREE.Material[] = []
  try {
    tsl = new WebGPURenderer({ canvas: tslCanvas, forceWebGL: true, antialias: false })
    await tsl.init()
    diagnostics.tsl.backend = (tsl.backend as { isWebGLBackend?: boolean }).isWebGLBackend ? 'webgl2' : 'webgpu'
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50)
    camera.position.set(0, 0, 4)
    camera.lookAt(0, 0, 0)
    scene.add(new THREE.DirectionalLight(0xffffff, 2), new THREE.AmbientLight(0xffffff, 0.3))
    const nodeMaterials = [
      { name: 'dissolve-node', material: createDissolveNodeMaterial().material },
      { name: 'holographic-node', material: createHolographicNodeMaterial().material },
      { name: 'iridescent-node', material: createIridescentNodeMaterial().material },
    ]
    const target = new THREE.RenderTarget(SIZE, SIZE)
    for (const { name, material } of nodeMaterials) {
      const mesh = new THREE.Mesh(sphere, material)
      scene.add(mesh)
      await tsl.compileAsync(scene, camera)
      tsl.setRenderTarget(target)
      tsl.setClearColor(0x000000, 0)
      await tsl.clearAsync()
      await tsl.renderAsync(scene, camera)
      const data = (await tsl.readRenderTargetPixelsAsync(target, 0, 0, SIZE, SIZE)) as Uint8Array | Float32Array
      tsl.setRenderTarget(null)
      let covered = 0
      for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) covered++
      diagnostics.tsl.materials.push({ name, coverage: covered / (SIZE * SIZE) })
      scene.remove(mesh)
      material.dispose()
    }
    target.dispose()
    // one visible frame with the three materials side by side, for the screenshot
    const row = [createDissolveNodeMaterial().material, createHolographicNodeMaterial().material, createIridescentNodeMaterial().material]
    row.forEach((material, i) => {
      const mesh = new THREE.Mesh(sphere, material)
      mesh.position.x = (i - 1) * 2.2
      mesh.scale.setScalar(0.9)
      scene.add(mesh)
    })
    camera.position.set(0, 0, 7)
    camera.lookAt(0, 0, 0)
    tsl.setSize(tslCanvas.clientWidth || 256, tslCanvas.clientHeight || 256, false)
    await tsl.renderAsync(scene, camera)
    tslRow = row
  } catch (error) {
    diagnostics.tsl.error = error instanceof Error ? error.message : String(error)
  }

  diagnostics.runtime = runtime.stats()
  diagnostics.ready = true

  return {
    diagnostics,
    dispose() {
      const beforeDispose = memory()
      mark('start')
      post.bloom.dispose()
      mark('bloom')
      post.dof.dispose()
      mark('dof')
      post.grain.dispose()
      mark('grain')
      post.smaa.dispose()
      mark('smaa')
      post.output.dispose()
      mark('output')
      post.composer.dispose()
      mark('composer')
      post.dispose()
      const afterPost = memory()
      disposeSceneGraph(runtime.scene, registry)
      mark('scene-graph')
      const kept = registry.dispose()
      mark(`registry(${kept.disposed.length} disposed)`)
      runtime.dispose()
      mark('runtime')
      for (const m of tslRow) m.dispose()
      tsl?.dispose()
      diagnostics.disposed = true
      diagnostics.afterDispose = { ...memory(), afterPost, beforeDispose }
      console.error = originalError
    },
  }
}
