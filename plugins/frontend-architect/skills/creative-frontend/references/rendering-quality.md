# Rendering and visual quality

Light, colour, materials, shadows, reflections and quality tiers for scenes that have to look like a studio rendered them and still run on a phone. The code is compiled by the three verification projects and used by the reference experiences (`immersive-experiences.md`); the pure parts (tiers, detection, shadow fitting, material presets) are tested in Node and the rest in Chromium.

## Contents

1. Light first: environments without assets
2. Colour management, tone mapping, exposure
3. Physically based materials: presets that read as materials
4. Shadows and reflections
5. Quality tiers and progressive quality
6. Visual direction: coherence over quantity
7. Tests

## 1. Light first: environments without assets

Physically based materials are lit by their environment; without one, metal is black and glass is nothing. An HDR environment map (`.hdr`/`.exr` through `RGBELoader`/`EXRLoader` and `PMREMGenerator`) is the usual answer and is a large asset. Two environments that need no file: Three.js's `RoomEnvironment` (a lit room: soft key, fill and rim, the studio look) and a procedural sky-gradient-plus-sun rendered into a PMREM, whose sun can exceed 1.0 (the PMREM is half-float, so highlights stay high-dynamic-range). Both are `shared` resources in a page with several scenes.

```ts
// @verify creative:rendering/environment.ts nuxt:lib/lab/rendering/environment.ts next:lib/lab/rendering/environment.ts
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { ResourceRegistry } from '../engine/resource-registry'

export interface EnvironmentHandle {
  texture: THREE.Texture
  dispose(): void
}

/** The studio: Three.js's RoomEnvironment pre-filtered for PBR. */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer, registry: ResourceRegistry): EnvironmentHandle {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const target = pmrem.fromScene(room, 0.04)
  pmrem.dispose()
  const texture = registry.shared(target.texture, 'studio-environment')
  return { texture, dispose: () => target.dispose() }
}

export interface GradientEnvironmentOptions {
  top?: THREE.ColorRepresentation
  horizon?: THREE.ColorRepresentation
  bottom?: THREE.ColorRepresentation
  /** sun direction (normalised inside), colour and angular size; intensity above 1 is the HDR highlight */
  sun?: { direction: THREE.Vector3; color?: THREE.ColorRepresentation; intensity?: number; size?: number }
}

/** A procedural sky: vertical gradient with a bright sun disc, pre-filtered. Colours above 1 are kept (half-float PMREM). */
export function createGradientEnvironment(renderer: THREE.WebGLRenderer, registry: ResourceRegistry, options: GradientEnvironmentOptions = {}): EnvironmentHandle {
  const sun = options.sun ?? { direction: new THREE.Vector3(0.4, 0.8, 0.3) }
  const uniforms = {
    uTop: { value: new THREE.Color(options.top ?? '#3a4a6a') },
    uHorizon: { value: new THREE.Color(options.horizon ?? '#d8c8b0') },
    uBottom: { value: new THREE.Color(options.bottom ?? '#1a1a1f') },
    uSunDir: { value: sun.direction.clone().normalize() },
    uSunColor: { value: new THREE.Color(sun.color ?? '#fff2d0') },
    uSunIntensity: { value: sun.intensity ?? 12 },
    uSunSize: { value: sun.size ?? 0.04 },
  }
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
      uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunIntensity; uniform float uSunSize;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 sky = y >= 0.0 ? mix(uHorizon, uTop, pow(y, 0.6)) : mix(uHorizon, uBottom, pow(-y, 0.5));
        float d = max(dot(normalize(vDir), uSunDir), 0.0);
        float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.3, d);
        float glow = pow(d, 24.0) * 0.6;
        gl_FragColor = vec4(sky + uSunColor * (disc * uSunIntensity + glow), 1.0);
      }
    `,
  })
  const scene = new THREE.Scene()
  const geometry = new THREE.SphereGeometry(50, 32, 16)
  scene.add(new THREE.Mesh(geometry, material))
  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromScene(scene, 0.02)
  pmrem.dispose()
  geometry.dispose()
  material.dispose()
  const texture = registry.shared(target.texture, 'gradient-environment')
  return { texture, dispose: () => target.dispose() }
}

export interface ApplyEnvironmentOptions {
  /** also show it as the background (blurred by `backgroundBlurriness`) */
  background?: boolean
  intensity?: number
  backgroundIntensity?: number
  backgroundBlurriness?: number
  /** rotation around y in radians, to place the key light where the composition wants it */
  rotationY?: number
}

export function applyEnvironment(scene: THREE.Scene, texture: THREE.Texture, options: ApplyEnvironmentOptions = {}): void {
  scene.environment = texture
  scene.environmentIntensity = options.intensity ?? 1
  scene.environmentRotation.set(0, options.rotationY ?? 0, 0)
  if (options.background) {
    scene.background = texture
    scene.backgroundIntensity = options.backgroundIntensity ?? 0.6
    scene.backgroundBlurriness = options.backgroundBlurriness ?? 0.4
    scene.backgroundRotation.set(0, options.rotationY ?? 0, 0)
  }
}
```

A three-point rig on top of the environment gives the shaping the environment alone lacks: a key `DirectionalLight` (the one that casts shadows), a soft fill (`HemisphereLight` or a dim second directional), a rim from behind to separate the subject from the background. Intensities in physically based units: a key of 2–4 with an environment at 1 is a bright studio, 0.5–1 a moody one.

## 2. Colour management, tone mapping, exposure

Three.js works in linear light and converts to sRGB on output (`renderer.outputColorSpace = SRGBColorSpace`, the default). Everything that is a *colour* must declare its colour space: colour textures `texture.colorSpace = SRGBColorSpace`; data textures (normal, roughness, metalness, displacement) stay linear; `new Color('#hex')` is sRGB input and is converted. Tone mapping compresses the HDR result into the display: ACES Filmic is the film look (contrasty, desaturates highlights), AgX is gentler and keeps saturated colours from clipping to yellow, Neutral is for product colour fidelity. Exposure is the single most important slider and should be decided once per scene.

```ts
// @verify creative:rendering/color.ts nuxt:lib/lab/rendering/color.ts next:lib/lab/rendering/color.ts
import * as THREE from 'three'

export type ToneMappingName = 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces' | 'agx' | 'neutral'
export const TONE_MAPPINGS: Record<ToneMappingName, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
}

export interface ColorPipeline {
  toneMapping: ToneMappingName
  exposure: number
}
/** Starting points: product colour fidelity, film look, and faithful UI-adjacent rendering. */
export const COLOR_PRESETS: Record<'product' | 'cinematic' | 'faithful', ColorPipeline> = {
  product: { toneMapping: 'agx', exposure: 1 },
  cinematic: { toneMapping: 'aces', exposure: 0.9 },
  faithful: { toneMapping: 'neutral', exposure: 1 },
}

export function applyColorPipeline(renderer: THREE.WebGLRenderer, pipeline: ColorPipeline): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = TONE_MAPPINGS[pipeline.toneMapping]
  renderer.toneMappingExposure = pipeline.exposure
}

/** Marks a texture as colour data (albedo, emissive) so it is decoded from sRGB; data maps must not be marked. */
export function asColorTexture<T extends THREE.Texture>(texture: T): T {
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
```

When rendering through an `EffectComposer`, tone mapping and the sRGB conversion move to the `OutputPass` at the end of the chain (`shader-engineering.md`); passes in between work in linear HDR, which is what bloom wants.

## 3. Physically based materials: presets that read as materials

`MeshPhysicalMaterial` has the parameters that make a surface recognisable: clearcoat for lacquer and car paint, transmission with thickness for glass, sheen for fabric, iridescence for films and anodised metal, anisotropy for brushed metal. Presets encode the combinations that read correctly; the overrides carry the brand colour.

```ts
// @verify creative:rendering/materials.ts nuxt:lib/lab/rendering/materials.ts next:lib/lab/rendering/materials.ts
import * as THREE from 'three'

export type PhysicalPresetName = 'brushedMetal' | 'carPaint' | 'frostedGlass' | 'clearGlass' | 'ceramic' | 'rubber' | 'velvet' | 'soapFilm' | 'anodised'
export const PHYSICAL_PRESETS: Record<PhysicalPresetName, THREE.MeshPhysicalMaterialParameters> = {
  brushedMetal: { color: '#b8b8bc', metalness: 1, roughness: 0.35, anisotropy: 0.8, anisotropyRotation: 0, envMapIntensity: 1 },
  carPaint: { color: '#8a1020', metalness: 0.6, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1 },
  frostedGlass: { color: '#ffffff', metalness: 0, roughness: 0.35, transmission: 1, thickness: 0.6, ior: 1.45, envMapIntensity: 1, attenuationDistance: 2, attenuationColor: '#dfe9ff' },
  clearGlass: { color: '#ffffff', metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.3, ior: 1.5, envMapIntensity: 1 },
  ceramic: { color: '#f2efe9', metalness: 0, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 1 },
  rubber: { color: '#1c1c1e', metalness: 0, roughness: 0.9, sheen: 0.2, sheenRoughness: 0.8, sheenColor: '#2a2a2e', envMapIntensity: 0.6 },
  velvet: { color: '#3b1f5a', metalness: 0, roughness: 1, sheen: 1, sheenRoughness: 0.5, sheenColor: '#b48cff', envMapIntensity: 0.8 },
  soapFilm: { color: '#101014', metalness: 0.2, roughness: 0.1, iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [100, 400], envMapIntensity: 1 },
  anodised: { color: '#222a3a', metalness: 1, roughness: 0.3, iridescence: 0.6, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 600], envMapIntensity: 1 },
}

export function createPhysicalMaterial(preset: PhysicalPresetName, overrides: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ ...PHYSICAL_PRESETS[preset], ...overrides })
}

/** Checks a material against the ranges that produce artefacts (negative roughness, transmission with transparent). */
export function materialIssues(material: THREE.MeshPhysicalMaterial): string[] {
  const issues: string[] = []
  const within = (name: string, value: number, min = 0, max = 1) => {
    if (value < min || value > max) issues.push(`${name} ${value} outside [${min}, ${max}]`)
  }
  within('roughness', material.roughness)
  within('metalness', material.metalness)
  within('clearcoat', material.clearcoat)
  within('transmission', material.transmission)
  within('sheen', material.sheen)
  within('iridescence', material.iridescence)
  if (material.transmission > 0 && material.transparent) issues.push('transmission with transparent: use transmission alone (transparent disables the transmission pass ordering)')
  if (material.transmission > 0 && material.thickness === 0) issues.push('transmission without thickness: refraction reads as flat')
  if (material.ior < 1 || material.ior > 2.333) issues.push(`ior ${material.ior} outside the physical range`)
  return issues
}
```

Transmission (glass) renders in its own pass over a copy of the opaque scene (`renderer.transmissionResolutionScale` controls its cost); it does not show other transmissive objects behind it unless they are sorted carefully. Glass behind glass is a composition decision, not a shader bug.

## 4. Shadows and reflections

One shadow-casting key light is almost always enough; every extra caster is another depth render. A directional light's shadow camera must be fitted to the subject (the default 10-unit box blurs everything or clips it), the map size follows the quality tier, `normalBias` removes acne on curved surfaces better than `bias`. Soft shadows: `PCFSoftShadowMap` is cheap and fine; `VSMShadowMap` blurs more and needs `radius`. Contact shadows for a product on a floor can be a baked plane with a radial gradient texture when the real thing is too expensive.

Reflections come from the environment for everything curved; a mirror-flat floor can use `Reflector` (renders the scene again from the mirrored camera: twice the draw calls, so at a reduced resolution and only when the floor is in frame) or a cheaper roughness-blurred copy of the environment.

```ts
// @verify creative:rendering/shadows.ts nuxt:lib/lab/rendering/shadows.ts next:lib/lab/rendering/shadows.ts
import * as THREE from 'three'

export interface ShadowSetup {
  mapSize: number
  soft?: boolean
  bias?: number
  normalBias?: number
}

export function configureShadows(renderer: THREE.WebGLRenderer, light: THREE.DirectionalLight, setup: ShadowSetup): void {
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = setup.soft === false ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
  light.castShadow = true
  light.shadow.mapSize.set(setup.mapSize, setup.mapSize)
  light.shadow.bias = setup.bias ?? -0.0002
  light.shadow.normalBias = setup.normalBias ?? 0.02
  light.shadow.map?.dispose()
  light.shadow.map = null
}

/** Fits the orthographic shadow camera of a directional light to a world-space box with a margin; returns the frustum. */
export function fitShadowCamera(light: THREE.DirectionalLight, box: THREE.Box3, margin = 0.5): { left: number; right: number; top: number; bottom: number; near: number; far: number } {
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const radius = size.length() / 2 + margin
  const direction = light.position.clone().sub(light.target.position).normalize()
  light.position.copy(center).add(direction.multiplyScalar(radius * 2))
  light.target.position.copy(center)
  light.target.updateMatrixWorld()
  const camera = light.shadow.camera
  camera.left = -radius
  camera.right = radius
  camera.top = radius
  camera.bottom = -radius
  camera.near = radius * 0.5
  camera.far = radius * 3.5
  camera.updateProjectionMatrix()
  return { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom, near: camera.near, far: camera.far }
}
```

## 5. Quality tiers and progressive quality

A tier bundles every knob that trades fidelity for time: pixel ratio, shadow map size (or no shadows), the post-processing tier, particle density, anisotropy, MSAA samples on the post target. The page starts at a tier guessed from cheap signals (pointer coarseness, memory, cores, data saver, reduced motion) and the density controller of `gpu-particles.md` moves it on measured frame times. No tier is promised a frame rate; the budget per device class is what the controller tries to meet.

| Device class | Budget | Starting tier | Notes |
|---|---|---|---|
| Desktop with discrete GPU | 16.7 ms (60 Hz) | ultra | 120 Hz displays get the same tier at 8.3 ms only when measured |
| Laptop / integrated GPU | 16.7 ms | high | post at native resolution is usually the first thing to drop |
| Recent phone | 16.7 ms | medium | pixel ratio 1.5 on a 3× screen is already heavy |
| Older phone, data saver, battery saver | 33 ms (30 Hz) | low | no shadows, no post, half density |
| No WebGL 2 / software renderer | n/a | minimal | static shots, the DOM carries the content |

```ts
// @verify creative:rendering/quality.ts nuxt:lib/lab/rendering/quality.ts next:lib/lab/rendering/quality.ts
import type { PostQuality } from '../shaders/post/pipeline'
import { POST_QUALITIES } from '../shaders/post/pipeline'

export interface QualityTier {
  name: 'ultra' | 'high' | 'medium' | 'low' | 'minimal'
  pixelRatio: number
  shadows: boolean
  shadowMapSize: number
  post: PostQuality
  particleDensity: number
  anisotropy: number
  /** frame budget in ms the controller aims for when this tier is the start */
  budgetMs: number
}

export const QUALITY_TIERS: QualityTier[] = [
  { name: 'ultra', pixelRatio: 2, shadows: true, shadowMapSize: 2048, post: POST_QUALITIES.cinematic, particleDensity: 1, anisotropy: 8, budgetMs: 16.7 },
  { name: 'high', pixelRatio: 1.5, shadows: true, shadowMapSize: 1024, post: POST_QUALITIES.balanced, particleDensity: 0.6, anisotropy: 4, budgetMs: 16.7 },
  { name: 'medium', pixelRatio: 1.25, shadows: true, shadowMapSize: 512, post: POST_QUALITIES.light, particleDensity: 0.35, anisotropy: 2, budgetMs: 16.7 },
  { name: 'low', pixelRatio: 1, shadows: false, shadowMapSize: 256, post: POST_QUALITIES.minimal, particleDensity: 0.15, anisotropy: 1, budgetMs: 33 },
  { name: 'minimal', pixelRatio: 1, shadows: false, shadowMapSize: 256, post: POST_QUALITIES.minimal, particleDensity: 0.05, anisotropy: 1, budgetMs: 33 },
]

export interface DeviceSignals {
  coarsePointer: boolean
  deviceMemory?: number
  hardwareConcurrency?: number
  saveData?: boolean
  reducedMotion?: boolean
  /** the UNMASKED_RENDERER string when available */
  renderer?: string
  webgl2: boolean
}

/** Reads the cheap signals a page has before rendering anything (call it on the client only). */
export function readDeviceSignals(nav: Navigator = navigator, media: (q: string) => boolean = (q) => window.matchMedia(q).matches, renderer?: string, webgl2 = true): DeviceSignals {
  const n = nav as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  return { coarsePointer: media('(pointer: coarse)'), deviceMemory: n.deviceMemory, hardwareConcurrency: n.hardwareConcurrency, saveData: n.connection?.saveData, reducedMotion: media('(prefers-reduced-motion: reduce)'), renderer, webgl2 }
}

/** The tier to start from; the controller corrects it from measured frames within a second. */
export function detectInitialTier(signals: DeviceSignals): QualityTier {
  const tier = (name: QualityTier['name']) => QUALITY_TIERS.find((t) => t.name === name)!
  if (!signals.webgl2 || /swiftshader|software|llvmpipe/i.test(signals.renderer ?? '')) return tier('minimal')
  if (signals.saveData) return tier('low')
  if (signals.coarsePointer) return (signals.deviceMemory ?? 4) >= 6 ? tier('medium') : tier('low')
  if ((signals.hardwareConcurrency ?? 4) <= 4 || (signals.deviceMemory ?? 8) <= 4) return tier('high')
  return tier('ultra')
}

export const tierIndex = (tier: QualityTier) => QUALITY_TIERS.indexOf(tier)
export const tierBelow = (tier: QualityTier) => QUALITY_TIERS[Math.min(QUALITY_TIERS.length - 1, tierIndex(tier) + 1)] ?? tier
export const tierAbove = (tier: QualityTier) => QUALITY_TIERS[Math.max(0, tierIndex(tier) - 1)] ?? tier
```

Progressive quality in practice: the first frames render at the detected tier minus one (a fast first paint matters more than its sharpness), the controller steps up after a stable second, and user settings win: a "performance mode" toggle pins the tier, and `prefers-reduced-motion` or `prefers-reduced-data` cap it.

## 6. Visual direction: coherence over quantity

A direction is a few decisions held everywhere: one environment and key direction (where the light comes from never changes between shots), one tone-mapping curve and exposure, two or three material families (one hero finish, one matte, one accent), one accent colour that is also the emissive and the bloom colour, grain and vignette at one level across the piece. The restraint checklist before adding an effect: does it serve the subject (a product's finish, a chapter's mood) or does it decorate? Does text over the canvas stay legible at the darkest and brightest frame? Do highlights clip across the frame (exposure problem) or only where meant to glow (bloom working)? Is there motion the user did not ask for while they read? `creative-quality-rubric.md` scores these next to ambition, because an experience that does less with intention beats one that does everything.

## 7. Tests

```ts
// @verify creative:rendering/rendering.test.ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { COLOR_PRESETS, TONE_MAPPINGS } from './color'
import { PHYSICAL_PRESETS, createPhysicalMaterial, materialIssues } from './materials'
import { fitShadowCamera } from './shadows'
import { QUALITY_TIERS, detectInitialTier, tierAbove, tierBelow } from './quality'

describe('quality tiers', () => {
  it('order from ultra to minimal with monotonic knobs and a device heuristic that degrades gracefully', () => {
    for (let i = 1; i < QUALITY_TIERS.length; i++) {
      const a = QUALITY_TIERS[i - 1]!
      const b = QUALITY_TIERS[i]!
      expect(b.pixelRatio).toBeLessThanOrEqual(a.pixelRatio)
      expect(b.particleDensity).toBeLessThan(a.particleDensity)
      expect(b.shadowMapSize).toBeLessThanOrEqual(a.shadowMapSize)
    }
    const base = { coarsePointer: false, webgl2: true, hardwareConcurrency: 12, deviceMemory: 16 }
    expect(detectInitialTier(base).name).toBe('ultra')
    expect(detectInitialTier({ ...base, hardwareConcurrency: 4 }).name).toBe('high')
    expect(detectInitialTier({ ...base, coarsePointer: true, deviceMemory: 8 }).name).toBe('medium')
    expect(detectInitialTier({ ...base, coarsePointer: true, deviceMemory: 3 }).name).toBe('low')
    expect(detectInitialTier({ ...base, saveData: true }).name).toBe('low')
    expect(detectInitialTier({ ...base, webgl2: false }).name).toBe('minimal')
    expect(detectInitialTier({ ...base, renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device' }).name).toBe('minimal')
    expect(tierBelow(QUALITY_TIERS[4]!).name).toBe('minimal')
    expect(tierAbove(QUALITY_TIERS[0]!).name).toBe('ultra')
    expect(tierBelow(QUALITY_TIERS[0]!).name).toBe('high')
  })
})

describe('colour pipeline', () => {
  it('maps every preset to a real tone mapping constant', () => {
    for (const preset of Object.values(COLOR_PRESETS)) expect(typeof TONE_MAPPINGS[preset.toneMapping]).toBe('number')
    expect(TONE_MAPPINGS.aces).toBe(THREE.ACESFilmicToneMapping)
    expect(TONE_MAPPINGS.agx).toBe(THREE.AgXToneMapping)
  })
})

describe('physical presets', () => {
  it('build MeshPhysicalMaterials without issues and flag the known mistakes', () => {
    for (const name of Object.keys(PHYSICAL_PRESETS) as (keyof typeof PHYSICAL_PRESETS)[]) {
      const material = createPhysicalMaterial(name)
      expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial)
      expect(materialIssues(material)).toEqual([])
    }
    const glass = createPhysicalMaterial('clearGlass', { transparent: true, thickness: 0 })
    expect(materialIssues(glass)).toEqual(['transmission with transparent: use transmission alone (transparent disables the transmission pass ordering)', 'transmission without thickness: refraction reads as flat'])
    const broken = createPhysicalMaterial('ceramic', { roughness: 1.4, ior: 3 })
    expect(materialIssues(broken)).toEqual(['roughness 1.4 outside [0, 1]', 'ior 3 outside the physical range'])
    expect(createPhysicalMaterial('carPaint', { color: '#0044ff' }).color.getHexString()).toBe('0044ff')
  })
})

describe('shadow fitting', () => {
  it('fits the orthographic frustum to a box and points the light at its centre', () => {
    const light = new THREE.DirectionalLight()
    light.position.set(5, 10, 5)
    const box = new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 3, 2))
    const frustum = fitShadowCamera(light, box, 0.5)
    const radius = box.getSize(new THREE.Vector3()).length() / 2 + 0.5
    expect(frustum.right).toBeCloseTo(radius, 6)
    expect(frustum.left).toBeCloseTo(-radius, 6)
    expect(frustum.far).toBeGreaterThan(frustum.near)
    expect(light.target.position.toArray()).toEqual([0, 1.5, 0])
    expect(light.position.distanceTo(light.target.position)).toBeCloseTo(radius * 2, 6)
  })
})
```
