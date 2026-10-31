# Shader engineering: GLSL for WebGL, TSL for WebGPU, post-processing

Vertex and fragment programs that give a scene its look: procedural noise, displacement, fresnel, thin-film iridescence, dissolve, holograms, screen-space refraction, image transitions, mask transitions, and a post-processing pipeline with quality tiers. Two libraries that never mix: GLSL `ShaderMaterial`s for `WebGLRenderer` and TSL node materials for `WebGPURenderer`. Every program here is compiled and rendered by the browser checks (`immersive-experiences.md`, lab page `/lab/shaders`), and the uniform helpers are tested in Node.

## Contents

1. GLSL or TSL: the contract
2. Uniforms that never allocate
3. GLSL chunks: noise, lighting, transitions
4. Materials
5. Post-processing pipeline with quality tiers
6. TSL node materials and WebGPU post-processing
7. Visual direction: fewer effects, better ones
8. Tests and what the browser proves

## 1. GLSL or TSL: the contract

| | `WebGLRenderer` + GLSL | `WebGPURenderer` + TSL |
|---|---|---|
| Write | `ShaderMaterial` / `RawShaderMaterial`, `onBeforeCompile` patches of built-in materials, `ShaderPass` | node materials (`MeshStandardNodeMaterial`, `MeshBasicNodeMaterial`...) whose `colorNode`, `positionNode`, `emissiveNode`, `opacityNode` are TSL graphs; `PostProcessing` with `pass()`, `bloom()`, `dof()`, `film()` nodes |
| Runs on | WebGL 2 everywhere | WebGPU where available, otherwise the renderer's WebGL 2 backend (TSL compiles to GLSL there) |
| Stability | stable for years | shipped, evolving release to release: pin the Three.js version and read the migration notes on upgrades |
| Portability | the same GLSL string does not run on `WebGPURenderer` | the same TSL graph runs on both backends; hand-written WGSL (`wgslFn`) runs on WebGPU only |
| Verified here | compiled, rendered and read back in headless Chromium | compiled and rendered on the WebGL 2 backend in headless Chromium; **real WebGPU not verified** (no `navigator.gpu` in the test browser) |

Decision: a project picks one renderer. New projects that need WebGPU features (compute, storage buffers) or want one shading language for both backends pick `WebGPURenderer` + TSL and accept the API churn; everything else, including every example that must run on today's whole audience, stays on `WebGLRenderer` + GLSL. Do not port a working GLSL pipeline to TSL for its own sake.

## 2. Uniforms that never allocate

A uniform is a `{ value }` box the program reads every frame. Changing the box (`material.uniforms.uProgress = { value: 1 }`) instead of its value is a frame-loop allocation and, for textures and vectors, a lost reference. The helper types the record once and tweens values in place.

```ts
// @verify creative:shaders/uniforms.ts nuxt:lib/lab/shaders/uniforms.ts next:lib/lab/shaders/uniforms.ts
import type * as THREE from 'three'

export type UniformValue = number | boolean | THREE.Vector2 | THREE.Vector3 | THREE.Vector4 | THREE.Color | THREE.Matrix3 | THREE.Matrix4 | THREE.Texture | null | number[]
export type Uniforms<T extends Record<string, UniformValue>> = { [K in keyof T]: { value: T[K] } }

/** Boxes initial values once; the boxes are what the ShaderMaterial keeps, so writes go through `.value`. */
export function defineUniforms<T extends Record<string, UniformValue>>(initial: T): Uniforms<T> {
  const out = {} as Uniforms<T>
  for (const key of Object.keys(initial) as (keyof T)[]) out[key] = { value: initial[key] }
  return out
}

export interface TweenHost {
  to(target: object, vars: object): unknown
}

/** Tweens a numeric uniform's value in place (GSAP or anything with `to(target, vars)`). */
export function tweenUniform(gsap: TweenHost, uniform: { value: number }, to: number, vars: { duration?: number; ease?: string; onComplete?: () => void } = {}): unknown {
  return gsap.to(uniform, { value: to, duration: vars.duration ?? 0.6, ease: vars.ease ?? 'power2.out', onComplete: vars.onComplete })
}

/** Writes a uniform value through `.value`, copying vector-like values instead of replacing the object. */
export function setUniform<V extends UniformValue>(uniform: { value: V }, value: V): void {
  const current = uniform.value as unknown
  if (current && typeof current === 'object' && 'copy' in (current as object) && value && typeof value === 'object' && typeof (current as { copy?: unknown }).copy === 'function') {
    ;(current as { copy(v: unknown): unknown }).copy(value)
    return
  }
  uniform.value = value
}
```

## 3. GLSL chunks: noise, lighting, transitions

Chunks are plain strings concatenated into programs. They declare functions only (no `main`, no `gl_FragColor`), so one chunk serves a material, a post pass and a GPGPU kernel.

```ts
// @verify creative:shaders/glsl/noise.ts nuxt:lib/lab/shaders/glsl/noise.ts next:lib/lab/shaders/glsl/noise.ts
/**
 * 3D simplex noise after Ian McEwan and Stefan Gustavson (Ashima Arts, MIT licence), plus fractional Brownian motion
 * and a divergence-free curl field built on it. Range of snoise: about [-1, 1].
 */
export const simplexNoise3 = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`

/** fbm(p, octaves): sum of octaves of snoise; octaves is a compile-time int (1..6). */
export const fbm3 = /* glsl */ `
float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p);
    total += amplitude;
    p = p * 2.02 + vec3(17.1, 9.3, 4.7);
    amplitude *= 0.5;
  }
  return value / max(total, 1e-5);
}
`

/** curlNoise(p): a divergence-free velocity field, the standard "flowing particles" force. */
export const curlNoise3 = /* glsl */ `
vec3 noisePotential(vec3 p) {
  return vec3(snoise(p), snoise(p + vec3(31.416, 17.2, 9.7)), snoise(p + vec3(-13.1, 42.0, 5.3)));
}
vec3 curlNoise(vec3 p) {
  const float e = 0.05;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 px0 = noisePotential(p - dx), px1 = noisePotential(p + dx);
  vec3 py0 = noisePotential(p - dy), py1 = noisePotential(p + dy);
  vec3 pz0 = noisePotential(p - dz), pz1 = noisePotential(p + dz);
  float x = (py1.z - py0.z) - (pz1.y - pz0.y);
  float y = (pz1.x - pz0.x) - (px1.z - px0.z);
  float z = (px1.y - px0.y) - (py1.x - py0.x);
  return vec3(x, y, z) / (2.0 * e);
}
`

/** Cheap hash and value noise for grain, dithering and jitter where simplex is overkill. */
export const hashNoise = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`
```

```ts
// @verify creative:shaders/glsl/lighting.ts nuxt:lib/lab/shaders/glsl/lighting.ts next:lib/lab/shaders/glsl/lighting.ts
/** View-dependent terms: fresnel rim, a stylised thin-film spectrum, hue rotation, a one-light lambert for custom materials. */
export const fresnelChunk = /* glsl */ `
float fresnel(vec3 viewDir, vec3 normal, float power) {
  return pow(1.0 - clamp(dot(normalize(viewDir), normalize(normal)), 0.0, 1.0), power);
}
`

/**
 * thinFilm(cosTheta, thickness): the colour bands of a soap bubble or oil film as three cosine waves out of phase.
 * A stylised approximation (no spectral integration): for physically based iridescence use MeshPhysicalMaterial's
 * `iridescence`, `iridescenceIOR` and `iridescenceThicknessRange`.
 */
export const thinFilmChunk = /* glsl */ `
vec3 thinFilm(float cosTheta, float thickness) {
  float phase = thickness * (1.0 - 0.5 * cosTheta);
  return 0.5 + 0.5 * cos(6.28318 * (phase + vec3(0.0, 0.33, 0.67)));
}
`

export const hueShiftChunk = /* glsl */ `
vec3 hueShift(vec3 color, float shift) {
  const vec3 k = vec3(0.57735, 0.57735, 0.57735);
  float cosAngle = cos(shift);
  return color * cosAngle + cross(k, color) * sin(shift) + k * dot(k, color) * (1.0 - cosAngle);
}
`

export const lambertChunk = /* glsl */ `
vec3 lambert(vec3 albedo, vec3 normal, vec3 lightDir, vec3 lightColor, float ambient) {
  float diffuse = max(dot(normalize(normal), normalize(lightDir)), 0.0);
  return albedo * (ambient + diffuse * lightColor);
}
`
```

```ts
// @verify creative:shaders/glsl/transitions.ts nuxt:lib/lab/shaders/glsl/transitions.ts next:lib/lab/shaders/glsl/transitions.ts
import { hashNoise } from './noise'

export const TRANSITION_MODES = ['crossfade', 'wipe-x', 'wipe-y', 'iris', 'dissolve'] as const
export type TransitionMode = (typeof TRANSITION_MODES)[number]

/** A full-screen triangle-friendly vertex program for post passes and transitions (plane of size 2). */
export const fullscreenVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * Blends two renders by a mask that depends on the mode: 0 crossfade, 1 wipe along x, 2 wipe along y, 3 radial iris
 * (aspect-corrected), 4 noise dissolve. uSoftness widens the edge; uProgress 0 shows uFrom, 1 shows uTo.
 */
export const maskTransitionFragment = /* glsl */ `
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uProgress;
uniform int uMode;
uniform float uSoftness;
uniform float uAspect;
varying vec2 vUv;
${hashNoise}
float maskValue(vec2 uv) {
  if (uMode == 1) return uv.x;
  if (uMode == 2) return 1.0 - uv.y;
  if (uMode == 3) {
    vec2 d = (uv - 0.5) * vec2(uAspect, 1.0);
    return length(d) / 0.7072;
  }
  if (uMode == 4) return valueNoise(uv * 8.0) * 0.8 + valueNoise(uv * 32.0) * 0.2;
  return 0.5;
}
void main() {
  vec4 from = texture2D(uFrom, vUv);
  vec4 to = texture2D(uTo, vUv);
  float t;
  if (uMode == 0) {
    t = uProgress;
  } else {
    float edge = uProgress * (1.0 + uSoftness) - uSoftness;
    t = smoothstep(edge, edge + uSoftness, maskValue(vUv));
    t = 1.0 - t;
  }
  gl_FragColor = mix(from, to, t);
}
`
```

## 4. Materials

Each factory returns the material, its typed uniforms and an `update(frame)` for the `animation` or `simulation` phase. The vertex programs share one body (`standardVertex`) that passes world position, view direction and normal; the displaced variant moves vertices along their normals by noise and recomputes the normal by finite differences so lighting follows the deformation.

```ts
// @verify creative:shaders/materials.ts nuxt:lib/lab/shaders/materials.ts next:lib/lab/shaders/materials.ts
import * as THREE from 'three'
import type { Frame } from '../engine/update-loop'
import { curlNoise3, fbm3, hashNoise, simplexNoise3 } from './glsl/noise'
import { fresnelChunk, hueShiftChunk, lambertChunk, thinFilmChunk } from './glsl/lighting'
import { defineUniforms, type Uniforms, type UniformValue } from './uniforms'

export interface ShaderEffect<U extends Record<string, UniformValue>> {
  material: THREE.ShaderMaterial
  uniforms: Uniforms<U>
  /** advance time-dependent uniforms; pass frame.delta 0 (timeScale 0) to freeze under reduced motion */
  update(frame: Pick<Frame, 'delta' | 'elapsed'>): void
}

const varyings = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec2 vUv;
varying vec3 vLocalPosition;
`

export const standardVertex = /* glsl */ `
${varyings}
void main() {
  vUv = uv;
  vLocalPosition = position;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = cameraPosition - worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

/** Noise displacement along the normal with a finite-difference normal, so the deformed surface still shades. */
export const displacedVertex = /* glsl */ `
${varyings}
uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uSpeed;
${simplexNoise3}
float displacement(vec3 p) {
  return snoise(p * uFrequency + vec3(0.0, uTime * uSpeed, 0.0)) * uAmplitude;
}
void main() {
  vUv = uv;
  vLocalPosition = position;
  vec3 displaced = position + normal * displacement(position);
  // neighbours on the tangent plane, displaced the same way, give the new normal
  vec3 tangent = normalize(abs(normal.y) < 0.99 ? cross(normal, vec3(0.0, 1.0, 0.0)) : cross(normal, vec3(1.0, 0.0, 0.0)));
  vec3 bitangent = normalize(cross(normal, tangent));
  float e = 0.02;
  vec3 pt = position + tangent * e;
  vec3 pb = position + bitangent * e;
  pt += normal * displacement(pt);
  pb += normal * displacement(pb);
  vec3 newNormal = normalize(cross(pt - displaced, pb - displaced));
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * newNormal);
  vViewDir = cameraPosition - worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

export function createDissolveMaterial(options: { color?: THREE.ColorRepresentation; edgeColor?: THREE.ColorRepresentation; edgeWidth?: number; scale?: number; lightDir?: THREE.Vector3 } = {}) {
  const uniforms = defineUniforms({
    uProgress: 0,
    uEdgeWidth: options.edgeWidth ?? 0.08,
    uScale: options.scale ?? 2.5,
    uColor: new THREE.Color(options.color ?? '#d9d4c7'),
    uEdgeColor: new THREE.Color(options.edgeColor ?? '#ffb347'),
    uLightDir: options.lightDir?.clone() ?? new THREE.Vector3(0.4, 1, 0.6),
  })
  const fragmentShader = /* glsl */ `
    ${varyings}
    uniform float uProgress;
    uniform float uEdgeWidth;
    uniform float uScale;
    uniform vec3 uColor;
    uniform vec3 uEdgeColor;
    uniform vec3 uLightDir;
    ${simplexNoise3}
    ${fbm3}
    ${lambertChunk}
    void main() {
      float n = fbm(vLocalPosition * uScale, 3) * 0.5 + 0.5;
      // progress 0: nothing dissolved; 1: everything gone. The threshold sweeps through the noise range.
      float threshold = uProgress * (1.0 + uEdgeWidth);
      if (n < threshold - uEdgeWidth) discard;
      float edge = 1.0 - smoothstep(threshold - uEdgeWidth, threshold, n);
      vec3 base = lambert(uColor, vWorldNormal, uLightDir, vec3(1.0), 0.35);
      vec3 color = mix(base, uEdgeColor * 2.0, edge);
      gl_FragColor = vec4(color, 1.0);
    }
  `
  const material = new THREE.ShaderMaterial({ vertexShader: standardVertex, fragmentShader, uniforms, side: THREE.DoubleSide })
  return { material, uniforms, update: () => {} } satisfies ShaderEffect<typeof uniforms extends Uniforms<infer U> ? U : never>
}

export function createHolographicMaterial(options: { color?: THREE.ColorRepresentation; rimColor?: THREE.ColorRepresentation; scanlines?: number; jitter?: number } = {}) {
  const uniforms = defineUniforms({
    uTime: 0,
    uColor: new THREE.Color(options.color ?? '#5ee7ff'),
    uRimColor: new THREE.Color(options.rimColor ?? '#ff7ad9'),
    uScanlines: options.scanlines ?? 120,
    uJitter: options.jitter ?? 0.02,
    uOpacity: 0.85,
  })
  const vertexShader = /* glsl */ `
    ${varyings}
    uniform float uTime;
    uniform float uJitter;
    ${hashNoise}
    void main() {
      vUv = uv;
      vLocalPosition = position;
      // horizontal glitch bands: a few rows of vertices slide sideways for a moment
      float band = step(0.97, hash12(vec2(floor(position.y * 8.0 + uTime * 3.0), floor(uTime * 7.0))));
      vec3 p = position + vec3(band * uJitter * sin(uTime * 40.0), 0.0, 0.0);
      vec4 worldPosition = modelMatrix * vec4(p, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vViewDir = cameraPosition - worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `
  const fragmentShader = /* glsl */ `
    ${varyings}
    uniform float uTime;
    uniform vec3 uColor;
    uniform vec3 uRimColor;
    uniform float uScanlines;
    uniform float uOpacity;
    ${fresnelChunk}
    ${hueShiftChunk}
    void main() {
      float rim = fresnel(vViewDir, vWorldNormal, 2.5);
      float scan = 0.6 + 0.4 * sin(vWorldPosition.y * uScanlines + uTime * 6.0);
      float flicker = 0.92 + 0.08 * sin(uTime * 23.0);
      vec3 color = hueShift(uColor, uTime * 0.4) * scan + uRimColor * rim * 1.5;
      float alpha = clamp((0.25 + rim) * flicker, 0.0, 1.0) * uOpacity;
      gl_FragColor = vec4(color, alpha);
    }
  `
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  return { material, uniforms, update: (f) => { uniforms.uTime.value += f.delta } } satisfies ShaderEffect<Record<string, UniformValue>>
}

export function createIridescentMaterial(options: { baseColor?: THREE.ColorRepresentation; thickness?: number; strength?: number; lightDir?: THREE.Vector3 } = {}) {
  const uniforms = defineUniforms({
    uBaseColor: new THREE.Color(options.baseColor ?? '#1b1b22'),
    uThickness: options.thickness ?? 2.2,
    uStrength: options.strength ?? 0.9,
    uLightDir: options.lightDir?.clone() ?? new THREE.Vector3(0.4, 1, 0.6),
  })
  const fragmentShader = /* glsl */ `
    ${varyings}
    uniform vec3 uBaseColor;
    uniform float uThickness;
    uniform float uStrength;
    uniform vec3 uLightDir;
    ${fresnelChunk}
    ${thinFilmChunk}
    ${lambertChunk}
    void main() {
      vec3 n = normalize(vWorldNormal);
      vec3 v = normalize(vViewDir);
      float cosTheta = clamp(dot(n, v), 0.0, 1.0);
      vec3 film = thinFilm(cosTheta, uThickness);
      float rim = fresnel(v, n, 3.0);
      vec3 base = lambert(uBaseColor, n, uLightDir, vec3(1.0), 0.3);
      vec3 color = base + film * uStrength * (0.35 + 0.65 * rim);
      gl_FragColor = vec4(color, 1.0);
    }
  `
  const material = new THREE.ShaderMaterial({ vertexShader: standardVertex, fragmentShader, uniforms })
  return { material, uniforms, update: () => {} } satisfies ShaderEffect<Record<string, UniformValue>>
}

/** Screen-space refraction: samples a render of the scene behind the object, offset by the view-space normal, with a chromatic split. */
export function createRefractionMaterial(backdrop: THREE.Texture, options: { strength?: number; dispersion?: number; tint?: THREE.ColorRepresentation; fresnelPower?: number } = {}) {
  const uniforms = defineUniforms({
    uBackdrop: backdrop as THREE.Texture | null,
    uResolution: new THREE.Vector2(1, 1),
    uStrength: options.strength ?? 0.08,
    uDispersion: options.dispersion ?? 0.012,
    uTint: new THREE.Color(options.tint ?? '#ffffff'),
    uFresnelPower: options.fresnelPower ?? 4,
  })
  const vertexShader = /* glsl */ `
    ${varyings}
    varying vec3 vViewNormal;
    void main() {
      vUv = uv;
      vLocalPosition = position;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vViewNormal = normalize(normalMatrix * normal);
      vViewDir = cameraPosition - worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `
  const fragmentShader = /* glsl */ `
    ${varyings}
    varying vec3 vViewNormal;
    uniform sampler2D uBackdrop;
    uniform vec2 uResolution;
    uniform float uStrength;
    uniform float uDispersion;
    uniform vec3 uTint;
    uniform float uFresnelPower;
    ${fresnelChunk}
    void main() {
      vec2 screenUv = gl_FragCoord.xy / uResolution;
      vec2 offset = vViewNormal.xy * uStrength;
      float r = texture2D(uBackdrop, screenUv - offset * (1.0 + uDispersion)).r;
      float g = texture2D(uBackdrop, screenUv - offset).g;
      float b = texture2D(uBackdrop, screenUv - offset * (1.0 - uDispersion)).b;
      float rim = fresnel(vViewDir, vWorldNormal, uFresnelPower);
      vec3 color = vec3(r, g, b) * uTint + rim * 0.6;
      gl_FragColor = vec4(color, 1.0);
    }
  `
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms })
  return { material, uniforms, update: () => {} } satisfies ShaderEffect<Record<string, UniformValue>>
}

/** Two images with a noise-displaced transition between them (galleries, hero swaps). */
export function createImageTransitionMaterial(from: THREE.Texture, to: THREE.Texture, options: { intensity?: number; scale?: number } = {}) {
  const uniforms = defineUniforms({ uFrom: from as THREE.Texture | null, uTo: to as THREE.Texture | null, uProgress: 0, uIntensity: options.intensity ?? 0.25, uScale: options.scale ?? 3 })
  const fragmentShader = /* glsl */ `
    ${varyings}
    uniform sampler2D uFrom;
    uniform sampler2D uTo;
    uniform float uProgress;
    uniform float uIntensity;
    uniform float uScale;
    ${simplexNoise3}
    void main() {
      float n = snoise(vec3(vUv * uScale, uProgress * 2.0));
      vec2 d = vec2(n) * uIntensity;
      vec4 a = texture2D(uFrom, vUv + d * uProgress);
      vec4 b = texture2D(uTo, vUv - d * (1.0 - uProgress));
      float t = smoothstep(0.0, 1.0, (uProgress - vUv.x * 0.25 - n * 0.15) / 0.6);
      gl_FragColor = mix(a, b, clamp(t, 0.0, 1.0));
    }
  `
  const material = new THREE.ShaderMaterial({ vertexShader: standardVertex, fragmentShader, uniforms })
  return { material, uniforms, update: () => {} } satisfies ShaderEffect<Record<string, UniformValue>>
}

/** Noise-displaced surface with its own lighting; the flowing-blob look. */
export function createDisplacedMaterial(options: { color?: THREE.ColorRepresentation; amplitude?: number; frequency?: number; speed?: number; lightDir?: THREE.Vector3 } = {}) {
  const uniforms = defineUniforms({
    uTime: 0,
    uAmplitude: options.amplitude ?? 0.25,
    uFrequency: options.frequency ?? 1.6,
    uSpeed: options.speed ?? 0.4,
    uColor: new THREE.Color(options.color ?? '#8b5cf6'),
    uLightDir: options.lightDir?.clone() ?? new THREE.Vector3(0.4, 1, 0.6),
  })
  const fragmentShader = /* glsl */ `
    ${varyings}
    uniform vec3 uColor;
    uniform vec3 uLightDir;
    ${fresnelChunk}
    ${lambertChunk}
    void main() {
      vec3 n = normalize(vWorldNormal);
      vec3 color = lambert(uColor, n, uLightDir, vec3(1.0), 0.3) + fresnel(vViewDir, n, 3.0) * 0.35;
      gl_FragColor = vec4(color, 1.0);
    }
  `
  const material = new THREE.ShaderMaterial({ vertexShader: displacedVertex, fragmentShader, uniforms })
  return { material, uniforms, update: (f) => { uniforms.uTime.value += f.delta } } satisfies ShaderEffect<Record<string, UniformValue>>
}

/**
 * Keeps the PBR of MeshStandardMaterial and adds the same noise displacement through onBeforeCompile: the
 * built-in lighting, environment, shadows and tone mapping keep working. The uniforms live in userData so the same
 * object is patched once and updated every frame.
 */
export function createDisplacedStandardMaterial(parameters: THREE.MeshStandardMaterialParameters = {}, options: { amplitude?: number; frequency?: number; speed?: number } = {}) {
  const uniforms = defineUniforms({ uTime: 0, uAmplitude: options.amplitude ?? 0.15, uFrequency: options.frequency ?? 1.8, uSpeed: options.speed ?? 0.3 })
  const material = new THREE.MeshStandardMaterial(parameters)
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uAmplitude;\nuniform float uFrequency;\nuniform float uSpeed;\n${simplexNoise3}\nfloat displacement(vec3 p) { return snoise(p * uFrequency + vec3(0.0, uTime * uSpeed, 0.0)) * uAmplitude; }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n{\n  vec3 tangentDir = normalize(abs(objectNormal.y) < 0.99 ? cross(objectNormal, vec3(0.0, 1.0, 0.0)) : cross(objectNormal, vec3(1.0, 0.0, 0.0)));\n  vec3 bitangentDir = normalize(cross(objectNormal, tangentDir));\n  float e = 0.02;\n  vec3 p0 = position + objectNormal * displacement(position);\n  vec3 pt = position + tangentDir * e; pt += objectNormal * displacement(pt);\n  vec3 pb = position + bitangentDir * e; pb += objectNormal * displacement(pb);\n  objectNormal = normalize(cross(pt - p0, pb - p0));\n}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * displacement(position);`)
  }
  material.customProgramCacheKey = () => 'displaced-standard'
  return { material, uniforms, update: (f: Pick<Frame, 'delta' | 'elapsed'>) => { uniforms.uTime.value += f.delta } }
}

/** Curl-noise flow field as a visible material (debugging forces, or a background) */
export const flowFieldFragment = /* glsl */ `
${varyings}
uniform float uTime;
${simplexNoise3}
${curlNoise3}
void main() {
  vec3 c = curlNoise(vec3(vUv * 3.0, uTime * 0.2));
  gl_FragColor = vec4(0.5 + 0.5 * normalize(c), 1.0);
}
`
```

The 1.3 `noise-material.ts` (`webgl-shaders.md`) stays as the minimal example; these are the production forms.

## 5. Post-processing pipeline with quality tiers

The composer renders the scene into a target and runs passes: bloom for emissive highlights and rims, depth of field for the product hero, grain and vignette for the film look, SMAA when the target has no MSAA, and `OutputPass` last (it applies tone mapping and the sRGB conversion that the renderer skips when rendering into a target). Quality is a tier the pipeline applies at once: resolution scale, bloom resolution, which passes are enabled. Every target the pipeline creates is registered as `own`.

```ts
// @verify creative:shaders/post/pipeline.ts nuxt:lib/lab/shaders/post/pipeline.ts next:lib/lab/shaders/post/pipeline.ts
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import type { SceneRuntime } from '../../engine/scene-runtime'
import { hashNoise } from '../glsl/noise'
import { fullscreenVertex } from '../glsl/transitions'

export interface PostQuality {
  name: string
  /** multiplies the renderer's pixel ratio for the composer targets */
  resolutionScale: number
  bloom: boolean
  dof: boolean
  grain: boolean
  smaa: boolean
}
export const POST_QUALITIES: Record<'cinematic' | 'balanced' | 'light' | 'minimal', PostQuality> = {
  cinematic: { name: 'cinematic', resolutionScale: 1, bloom: true, dof: true, grain: true, smaa: true },
  balanced: { name: 'balanced', resolutionScale: 1, bloom: true, dof: false, grain: true, smaa: true },
  light: { name: 'light', resolutionScale: 0.75, bloom: true, dof: false, grain: false, smaa: false },
  minimal: { name: 'minimal', resolutionScale: 0.6, bloom: false, dof: false, grain: false, smaa: false },
}

export interface PostOptions {
  bloom?: { strength?: number; radius?: number; threshold?: number }
  dof?: { focus?: number; aperture?: number; maxblur?: number }
  grain?: { amount?: number; vignette?: number; aberration?: number }
  quality?: PostQuality
}

export interface PostPipeline {
  readonly composer: EffectComposer
  readonly bloom: UnrealBloomPass
  readonly dof: BokehPass
  readonly grain: ShaderPass
  readonly smaa: SMAAPass
  readonly output: OutputPass
  quality: PostQuality
  setQuality(quality: PostQuality): void
  /** depth of field focus distance in world units (tween it with the camera) */
  focus(distance: number): void
  render(delta: number): void
  dispose(): void
}

const grainShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uAmount: { value: 0.06 }, uVignette: { value: 0.35 }, uAberration: { value: 0.0015 } },
  vertexShader: fullscreenVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform float uVignette;
    uniform float uAberration;
    varying vec2 vUv;
    ${hashNoise}
    void main() {
      vec2 toCentre = vUv - 0.5;
      vec2 shift = toCentre * uAberration * 10.0;
      vec3 color = vec3(texture2D(tDiffuse, vUv + shift).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - shift).b);
      float grain = (hash12(vUv * 1024.0 + fract(uTime) * 100.0) - 0.5) * uAmount;
      float vignette = 1.0 - uVignette * smoothstep(0.35, 0.9, length(toCentre) * 1.4);
      gl_FragColor = vec4((color + grain) * vignette, 1.0);
    }
  `,
}

export function createPostPipeline(runtime: SceneRuntime, options: PostOptions = {}): PostPipeline {
  const { renderer, scene, camera, registry } = runtime
  const size = renderer.getSize(new THREE.Vector2())
  const target = registry.own(new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 4 }), 'post-target')
  const composer = new EffectComposer(renderer, target)
  const renderPass = new RenderPass(scene, camera)
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), options.bloom?.strength ?? 0.6, options.bloom?.radius ?? 0.4, options.bloom?.threshold ?? 0.85)
  const dof = new BokehPass(scene, camera, { focus: options.dof?.focus ?? 6, aperture: options.dof?.aperture ?? 0.00025, maxblur: options.dof?.maxblur ?? 0.008 })
  const grain = new ShaderPass(grainShader)
  grain.uniforms.uAmount!.value = options.grain?.amount ?? 0.06
  grain.uniforms.uVignette!.value = options.grain?.vignette ?? 0.35
  grain.uniforms.uAberration!.value = options.grain?.aberration ?? 0.0015
  const smaa = new SMAAPass()
  const output = new OutputPass()
  for (const pass of [renderPass, bloom, dof, grain, smaa, output]) composer.addPass(pass)

  let quality = options.quality ?? POST_QUALITIES.balanced
  const apply = (width: number, height: number) => {
    const ratio = renderer.getPixelRatio() * quality.resolutionScale
    composer.setPixelRatio(ratio)
    composer.setSize(width, height) // UnrealBloomPass sizes its mips from this (half the frame, then halving); resolutionScale is the bloom knob too
    bloom.enabled = quality.bloom
    dof.enabled = quality.dof
    grain.enabled = quality.grain
    smaa.enabled = quality.smaa
  }
  const unsubscribe = runtime.onResize(apply)
  runtime.setRender(() => composer.render())

  return {
    composer,
    bloom,
    dof,
    grain,
    smaa,
    output,
    get quality() {
      return quality
    },
    set quality(value) {
      quality = value
      const s = renderer.getSize(new THREE.Vector2())
      apply(s.x, s.y)
    },
    setQuality(value) {
      this.quality = value
    },
    focus(distance) {
      ;(dof.uniforms as { focus: { value: number } }).focus.value = distance
    },
    render(delta) {
      grain.uniforms.uTime!.value += delta
      composer.render(delta)
    },
    dispose() {
      unsubscribe()
      runtime.setRender(() => renderer.render(scene, camera))
      for (const pass of [bloom, dof, grain, smaa, output]) pass.dispose()
      composer.dispose() // the composer owns its read/write buffers; the initial target is in the registry
    },
  }
}
```

The DOF focus follows the camera: when a sequence lands on a detail shot, `focus(distanceToTarget)` is a cue like any other. Bloom threshold above 0.8 keeps it on emissive rims and highlights instead of washing the frame.

## 6. TSL node materials and WebGPU post-processing

The same looks for `WebGPURenderer`, written as node graphs. The graph compiles to WGSL on WebGPU and to GLSL on the WebGL 2 backend; the lab page compiles them on the WebGL 2 backend (`forceWebGL: true`), which is the only backend the test browser has.

```ts
// @verify creative:shaders/tsl/materials.ts nuxt:lib/lab/shaders/tsl/materials.ts next:lib/lab/shaders/tsl/materials.ts
import * as THREE from 'three'
import { MeshStandardNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu'
import { Discard, Fn, color, float, mix, mx_noise_float, normalView, positionLocal, positionViewDirection, smoothstep, time, uniform, vec3 } from 'three/tsl'

/** Noise dissolve as a node material: discard below the threshold, emissive edge above it. */
export function createDissolveNodeMaterial(options: { color?: THREE.ColorRepresentation; edgeColor?: THREE.ColorRepresentation; edgeWidth?: number; scale?: number } = {}) {
  const uProgress = uniform(0)
  const uEdgeWidth = uniform(options.edgeWidth ?? 0.08)
  const uScale = uniform(options.scale ?? 2.5)
  const material = new MeshStandardNodeMaterial({ color: new THREE.Color(options.color ?? '#d9d4c7'), roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide })
  const noise = mx_noise_float(positionLocal.mul(uScale)).mul(0.5).add(0.5)
  const threshold = uProgress.mul(float(1).add(uEdgeWidth))
  const edge = smoothstep(threshold.sub(uEdgeWidth), threshold, noise).oneMinus()
  material.emissiveNode = color(new THREE.Color(options.edgeColor ?? '#ffb347')).mul(edge).mul(2)
  material.colorNode = Fn(() => {
    Discard(noise.lessThan(threshold.sub(uEdgeWidth)))
    return color(new THREE.Color(options.color ?? '#d9d4c7'))
  })()
  return { material, uniforms: { uProgress, uEdgeWidth, uScale } }
}

/** Fresnel rim plus hue-cycling scanlines, unlit. */
export function createHolographicNodeMaterial(options: { color?: THREE.ColorRepresentation; rimColor?: THREE.ColorRepresentation; scanlines?: number } = {}) {
  const uScanlines = uniform(options.scanlines ?? 120)
  const uOpacity = uniform(0.85)
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const rim = normalView.dot(positionViewDirection).clamp(0, 1).oneMinus().pow(2.5)
  const scan = positionLocal.y.mul(uScanlines).add(time.mul(6)).sin().mul(0.4).add(0.6)
  const base = color(new THREE.Color(options.color ?? '#5ee7ff'))
  const rimColor = color(new THREE.Color(options.rimColor ?? '#ff7ad9'))
  material.colorNode = base.mul(scan).add(rimColor.mul(rim).mul(1.5))
  material.opacityNode = rim.add(0.25).clamp(0, 1).mul(uOpacity)
  return { material, uniforms: { uScanlines, uOpacity } }
}

/** Stylised thin-film bands over a dark base, view-dependent, as a node graph. */
export function createIridescentNodeMaterial(options: { baseColor?: THREE.ColorRepresentation; thickness?: number; strength?: number } = {}) {
  const uThickness = uniform(options.thickness ?? 2.2)
  const uStrength = uniform(options.strength ?? 0.9)
  const material = new MeshStandardNodeMaterial({ color: new THREE.Color(options.baseColor ?? '#1b1b22'), roughness: 0.35, metalness: 0.6 })
  const cosTheta = normalView.dot(positionViewDirection).clamp(0, 1)
  const phase = uThickness.mul(cosTheta.mul(0.5).oneMinus())
  const film = vec3(phase, phase.add(0.33), phase.add(0.67)).mul(6.28318).cos().mul(0.5).add(0.5)
  const rim = cosTheta.oneMinus().pow(3)
  material.emissiveNode = film.mul(uStrength).mul(rim.mul(0.65).add(0.35))
  return { material, uniforms: { uThickness, uStrength } }
}

/** Mix helper kept for pages that blend two node colours by a uniform (chapter tints). */
export function tintNode(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation) {
  const uMix = uniform(0)
  return { node: mix(color(new THREE.Color(a)), color(new THREE.Color(b)), uMix), uMix }
}
```

WebGPU post-processing is a node graph too (`PostProcessing` from `three/webgpu`, `pass(scene, camera)`, `bloom(node)`, `dof(node)`, `film(node)`); it is documented in the Three.js examples and not reproduced here because the test browser cannot run it on WebGPU and the WebGL 2 backend of the node post pipeline was not exercised by this repository.

## 7. Visual direction: fewer effects, better ones

A coherent look is a small set of decisions applied everywhere: one light rig (key, fill, rim, environment), one tone-mapping curve and exposure, one palette of two or three material families, one grain level, bloom only on what is meant to glow. Signs of too much: text over the canvas becomes hard to read (bloom and grain on the UI layer), highlights clip to white across the frame (exposure, not bloom, is wrong), motion blur and DOF fight the scroll (they belong to timed sequences, not to scrubbed ones), every surface is iridescent (one hero material, the rest matte). The rubric in `creative-quality-rubric.md` scores legibility and restraint next to ambition.

## 8. Tests and what the browser proves

Node (Vitest): the uniform helpers write through `.value`, vector values are copied, the chunks declare the functions the materials call and contain no `main`, the transition modes map to their indices.

```ts
// @verify creative:shaders/shaders.test.ts
import gsap from 'gsap'
import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { curlNoise3, fbm3, hashNoise, simplexNoise3 } from './glsl/noise'
import { fresnelChunk, hueShiftChunk, lambertChunk, thinFilmChunk } from './glsl/lighting'
import { TRANSITION_MODES, fullscreenVertex, maskTransitionFragment } from './glsl/transitions'
import { createDissolveMaterial, createDisplacedMaterial, createHolographicMaterial, createIridescentMaterial } from './materials'
import { defineUniforms, setUniform, tweenUniform } from './uniforms'

afterEach(() => {
  gsap.globalTimeline.clear()
})

describe('uniform helpers', () => {
  it('boxes values once and writes through .value; vectors are copied, not replaced', () => {
    const colour = new THREE.Color('#ff0000')
    const u = defineUniforms({ uTime: 0, uColor: colour, uDir: new THREE.Vector3(1, 0, 0) })
    const colourBox = u.uColor
    setUniform(u.uColor, new THREE.Color('#00ff00'))
    expect(u.uColor).toBe(colourBox)
    expect(u.uColor.value).toBe(colour) // same object, new value
    expect(colour.getHexString()).toBe('00ff00')
    setUniform(u.uTime, 2)
    expect(u.uTime.value).toBe(2)
    const tween = tweenUniform(gsap, u.uTime, 10, { duration: 1, ease: 'none' }) as gsap.core.Tween
    tween.progress(0.5)
    expect(u.uTime.value).toBeCloseTo(6, 5)
  })
})

describe('GLSL chunks', () => {
  it('declare their functions and no main', () => {
    const declares = (chunk: string, name: string) => new RegExp(`\\b(?:float|vec3)\\s+${name}\\s*\\(`).test(chunk)
    expect(declares(simplexNoise3, 'snoise')).toBe(true)
    expect(declares(fbm3, 'fbm')).toBe(true)
    expect(declares(curlNoise3, 'curlNoise')).toBe(true)
    expect(declares(hashNoise, 'hash12')).toBe(true)
    expect(declares(fresnelChunk, 'fresnel')).toBe(true)
    expect(declares(thinFilmChunk, 'thinFilm')).toBe(true)
    expect(declares(hueShiftChunk, 'hueShift')).toBe(true)
    expect(declares(lambertChunk, 'lambert')).toBe(true)
    for (const chunk of [simplexNoise3, fbm3, curlNoise3, hashNoise, fresnelChunk, thinFilmChunk, hueShiftChunk, lambertChunk]) expect(chunk).not.toMatch(/void\s+main/)
  })

  it('the transition program covers every mode and the fullscreen vertex ignores the camera', () => {
    expect(TRANSITION_MODES).toEqual(['crossfade', 'wipe-x', 'wipe-y', 'iris', 'dissolve'])
    for (let i = 1; i < TRANSITION_MODES.length; i++) expect(maskTransitionFragment).toContain(`uMode == ${i}`)
    expect(fullscreenVertex).not.toMatch(/projectionMatrix|modelViewMatrix/)
  })
})

describe('material factories', () => {
  it('build ShaderMaterials whose uniforms are the boxes the factory returned, and update time in place', () => {
    for (const effect of [createDissolveMaterial(), createHolographicMaterial(), createIridescentMaterial(), createDisplacedMaterial()]) {
      expect(effect.material).toBeInstanceOf(THREE.ShaderMaterial)
      for (const [key, box] of Object.entries(effect.uniforms)) expect(effect.material.uniforms[key]).toBe(box)
      expect(effect.material.fragmentShader).toMatch(/void\s+main/)
      expect(effect.material.vertexShader).toMatch(/void\s+main/)
    }
    const holo = createHolographicMaterial()
    holo.update({ delta: 0.5, elapsed: 0.5 })
    holo.update({ delta: 0, elapsed: 0.5 }) // reduced motion: timeScale 0 freezes it
    expect(holo.uniforms.uTime.value).toBe(0.5)
    const dissolve = createDissolveMaterial({ edgeWidth: 0.1 })
    expect(dissolve.uniforms.uEdgeWidth.value).toBe(0.1)
    expect(dissolve.material.side).toBe(THREE.DoubleSide)
  })
})
```

Browser (`/lab/shaders`, both frameworks): every GLSL material and the transition program compile and link (no `THREE.WebGLProgram` shader error on the console, every program runnable), each renders a non-empty image into a small target, dissolve at progress 1 discards everything and at 0 nothing, the transition at progress 0 equals A and at 1 equals B, the composer's five passes render without error at each quality tier and the tier changes the targets' size; the TSL materials compile on the WebGL 2 backend of `WebGPURenderer` and render. What it does not prove: appearance (that is the visual evidence and the rubric), WebGPU proper, performance on real GPUs.
