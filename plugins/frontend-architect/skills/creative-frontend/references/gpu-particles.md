# GPU particles and simulation

Large particle systems whose motion is computed on the GPU: instanced geometry whose vertex shader derives every position from a seed, time and a flow field (the CPU uploads nothing per frame), and a ping-pong simulation in float render targets (positions and velocities advanced by fragment shaders, with forces, a pointer, and formations sampled from a model surface). A CPU implementation of the same system is kept as the baseline the comparison is measured against, and an adaptive density controller trades particle count and pixel ratio for frame time. Everything here is compiled and measured by the lab page `/lab/particles` (`immersive-experiences.md`); the controller, formations and CPU integration are tested in Node.

## Contents

1. What "GPU-driven" means (and what does not count)
2. Formations: where particles want to be
3. Instanced field: motion in the vertex shader
4. GPGPU simulation: positions and velocities in render targets
5. CPU baseline
6. Adaptive density
7. Interaction: pointer and scroll
8. Fallbacks
9. Measurements and tests

## 1. What "GPU-driven" means (and what does not count)

A system is GPU-driven when the per-particle work of a frame runs in a shader and the CPU's cost per frame does not grow with the particle count. Two honest forms:

- **Stateless**: position = f(seed, time, uniforms) in the vertex shader. No memory of the previous frame, so no collisions or accumulated forces, but millions of instances cost the CPU one uniform upload. Right for ambient fields, dust, flow lines, formation morphs driven by progress.
- **Stateful**: positions and velocities live in textures; one fragment shader per frame integrates forces into the next texture (ping-pong); the draw call reads the texture. Right for attraction, repulsion, trails, dispersion and reconstruction, pointer interaction with memory.

What does not count: `for (i < count) positions[i] += ...` in JavaScript followed by `attribute.needsUpdate = true`, however many particles it draws with one call. That is the CPU baseline of section 5, measured, not disparaged: below a few thousand particles it is simpler and fast enough.

## 2. Formations: where particles want to be

Targets are positions per particle: a sphere, a ring, a grid, the surface of any mesh (`MeshSurfaceSampler` samples triangles weighted by area). Packed into a float texture they become the attractor of the simulation or the end state of a morph; two textures and a `uMorph` uniform make a model dissolve into dust and reassemble as another.

```ts
// @verify creative:particles/formations.ts nuxt:lib/lab/particles/formations.ts next:lib/lab/particles/formations.ts
import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

/** Deterministic pseudo-random numbers so formations and tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** count points spread evenly on a sphere (Fibonacci lattice). */
export function sphereFormation(count: number, radius: number, out = new Float32Array(count * 3)): Float32Array {
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    out[i * 3] = Math.cos(theta) * r * radius
    out[i * 3 + 1] = y * radius
    out[i * 3 + 2] = Math.sin(theta) * r * radius
  }
  return out
}

export function ringFormation(count: number, radius: number, thickness: number, seed = 1, out = new Float32Array(count * 3)): Float32Array {
  const random = mulberry32(seed)
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    const r = radius + (random() - 0.5) * thickness
    out[i * 3] = Math.cos(angle) * r
    out[i * 3 + 1] = (random() - 0.5) * thickness
    out[i * 3 + 2] = Math.sin(angle) * r
  }
  return out
}

export function gridFormation(count: number, width: number, depth: number, out = new Float32Array(count * 3)): Float32Array {
  const columns = Math.ceil(Math.sqrt(count))
  for (let i = 0; i < count; i++) {
    const x = (i % columns) / Math.max(1, columns - 1) - 0.5
    const z = Math.floor(i / columns) / Math.max(1, columns - 1) - 0.5
    out[i * 3] = x * width
    out[i * 3 + 1] = 0
    out[i * 3 + 2] = z * depth
  }
  return out
}

/** count points on the surface of a mesh, area-weighted, in the mesh's local space (apply its matrix if needed). */
export function surfaceFormation(mesh: THREE.Mesh, count: number, seed = 1, out = new Float32Array(count * 3)): Float32Array {
  const sampler = new MeshSurfaceSampler(mesh).build()
  // setRandomGenerator() exists in three 0.186 but not yet in @types/three 0.186: assign the field it sets
  ;(sampler as unknown as { randomFunction: () => number }).randomFunction = mulberry32(seed)
  const p = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    sampler.sample(p)
    out[i * 3] = p.x
    out[i * 3 + 1] = p.y
    out[i * 3 + 2] = p.z
  }
  return out
}

/** Packs xyz positions into a square RGBA float texture (w = 1) of the given side; the remainder is zero. */
export function formationTexture(positions: Float32Array, side: number): THREE.DataTexture {
  const data = new Float32Array(side * side * 4)
  const count = Math.min(positions.length / 3, side * side)
  for (let i = 0; i < count; i++) {
    data[i * 4] = positions[i * 3] ?? 0
    data[i * 4 + 1] = positions[i * 3 + 1] ?? 0
    data[i * 4 + 2] = positions[i * 3 + 2] ?? 0
    data[i * 4 + 3] = 1
  }
  const texture = new THREE.DataTexture(data, side, side, THREE.RGBAFormat, THREE.FloatType)
  texture.needsUpdate = true
  return texture
}

/** Mean distance from each particle to its target (verification and adaptive logic). */
export function meanDistance(a: Float32Array | ArrayLike<number>, b: Float32Array | ArrayLike<number>, count: number, strideA = 3, strideB = 3): number {
  let sum = 0
  for (let i = 0; i < count; i++) {
    const dx = (a[i * strideA] ?? 0) - (b[i * strideB] ?? 0)
    const dy = (a[i * strideA + 1] ?? 0) - (b[i * strideB + 1] ?? 0)
    const dz = (a[i * strideA + 2] ?? 0) - (b[i * strideB + 2] ?? 0)
    sum += Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
  return sum / Math.max(1, count)
}
```

## 3. Instanced field: motion in the vertex shader

One `InstancedBufferGeometry` (a small quad per instance) with a per-instance seed; the vertex shader computes the instance's world position from the seed, the time, a curl-noise flow and the pointer, then billboards the quad. `instanceCount` is the density knob: lowering it draws fewer instances in the same single draw call without touching buffers. Formations morph by `uMorph`: each instance interpolates between its home on formation A and B.

```ts
// @verify creative:particles/instanced-field.ts nuxt:lib/lab/particles/instanced-field.ts next:lib/lab/particles/instanced-field.ts
import * as THREE from 'three'
import type { ResourceRegistry } from '../engine/resource-registry'
import { curlNoise3, simplexNoise3 } from '../shaders/glsl/noise'
import { defineUniforms } from '../shaders/uniforms'
import { mulberry32 } from './formations'

export interface InstancedFieldOptions {
  count: number
  formationA: Float32Array
  formationB: Float32Array
  size?: number
  color?: THREE.ColorRepresentation
  seed?: number
}

export const instancedFieldVertex = /* glsl */ `
attribute vec3 aSeed;
attribute vec3 aHomeA;
attribute vec3 aHomeB;
uniform float uTime;
uniform float uMorph;
uniform float uFlow;
uniform float uSize;
uniform vec3 uPointer;
uniform float uPointerStrength;
uniform float uPointerRadius;
varying float vLife;
varying vec2 vQuad;
${simplexNoise3}
${curlNoise3}
void main() {
  vQuad = position.xy;
  vec3 home = mix(aHomeA, aHomeB, uMorph);
  // the flow displaces each instance around its home; the seed decorrelates neighbours
  vec3 flow = curlNoise(home * 0.6 + aSeed * 3.0 + vec3(0.0, uTime * 0.15, 0.0)) * uFlow;
  float phase = uTime * (0.5 + aSeed.x) + aSeed.y * 6.28318;
  vec3 wobble = vec3(sin(phase), cos(phase * 1.3), sin(phase * 0.7)) * 0.05;
  vec3 world = home + flow + wobble;
  // the pointer pushes instances out of its radius
  vec3 away = world - uPointer;
  float d = length(away);
  float push = uPointerStrength * smoothstep(uPointerRadius, 0.0, d);
  world += normalize(away + vec3(1e-4)) * push;
  vLife = 0.5 + 0.5 * sin(phase);
  vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
  // billboard: the quad's corners are added in view space
  mvPosition.xy += position.xy * uSize * (0.6 + 0.4 * aSeed.z);
  gl_Position = projectionMatrix * mvPosition;
}
`

export const instancedFieldFragment = /* glsl */ `
uniform vec3 uColor;
varying float vLife;
varying vec2 vQuad;
void main() {
  float r = length(vQuad) * 2.0;
  float alpha = smoothstep(1.0, 0.4, r) * (0.4 + 0.6 * vLife);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor * (0.7 + 0.5 * vLife), alpha);
}
`

export function createInstancedField(registry: ResourceRegistry, options: InstancedFieldOptions) {
  const { count } = options
  const random = mulberry32(options.seed ?? 7)
  const base = new THREE.PlaneGeometry(1, 1)
  const geometry = registry.own(new THREE.InstancedBufferGeometry(), 'instanced-field-geometry')
  geometry.index = base.index
  geometry.setAttribute('position', base.getAttribute('position'))
  geometry.setAttribute('uv', base.getAttribute('uv'))
  const seeds = new Float32Array(count * 3)
  for (let i = 0; i < seeds.length; i++) seeds[i] = random()
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3))
  geometry.setAttribute('aHomeA', new THREE.InstancedBufferAttribute(options.formationA.slice(0, count * 3), 3))
  geometry.setAttribute('aHomeB', new THREE.InstancedBufferAttribute(options.formationB.slice(0, count * 3), 3))
  geometry.instanceCount = count
  const uniforms = defineUniforms({ uTime: 0, uMorph: 0, uFlow: 0.6, uSize: options.size ?? 0.05, uColor: new THREE.Color(options.color ?? '#9ad8ff'), uPointer: new THREE.Vector3(1e3, 1e3, 1e3), uPointerStrength: 0.8, uPointerRadius: 1.2 })
  const material = registry.own(new THREE.ShaderMaterial({ vertexShader: instancedFieldVertex, fragmentShader: instancedFieldFragment, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 'instanced-field-material')
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  return {
    mesh,
    uniforms,
    /** draws the first n instances; the buffers stay */
    setCount(n: number) {
      geometry.instanceCount = Math.max(0, Math.min(count, Math.floor(n)))
    },
    get count() {
      return geometry.instanceCount
    },
    update(delta: number) {
      uniforms.uTime.value += delta
    },
  }
}
```

## 4. GPGPU simulation: positions and velocities in render targets

`GPUComputationRenderer` keeps one ping-pong pair of float render targets per variable and runs a fragment shader over each. The velocity kernel integrates forces: a spring towards the particle's target (a formation texture, morphed between two), curl-noise turbulence, pointer repulsion, drag; the position kernel integrates velocity. Each particle is one texel; a `Points` geometry carries one `aRef` uv per particle and its vertex shader reads the position texture. Texture side 128 is 16,384 particles, 256 is 65,536, 512 is 262,144.

```ts
// @verify creative:particles/gpgpu-simulation.ts nuxt:lib/lab/particles/gpgpu-simulation.ts next:lib/lab/particles/gpgpu-simulation.ts
import * as THREE from 'three'
import { GPUComputationRenderer, type Variable } from 'three/addons/misc/GPUComputationRenderer.js'
import type { ResourceRegistry } from '../engine/resource-registry'
import { curlNoise3, simplexNoise3 } from '../shaders/glsl/noise'
import { defineUniforms } from '../shaders/uniforms'
import { formationTexture, mulberry32 } from './formations'

export const velocityKernel = /* glsl */ `
uniform float uDelta;
uniform float uTime;
uniform float uMorph;
uniform float uAttraction;
uniform float uCurl;
uniform float uDrag;
uniform vec3 uPointer;
uniform float uPointerStrength;
uniform float uPointerRadius;
uniform sampler2D uTargetsA;
uniform sampler2D uTargetsB;
${simplexNoise3}
${curlNoise3}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 pos = texture2D(texturePosition, uv);
  vec3 vel = texture2D(textureVelocity, uv).xyz;
  vec3 target = mix(texture2D(uTargetsA, uv).xyz, texture2D(uTargetsB, uv).xyz, uMorph);
  vec3 toTarget = target - pos.xyz;
  vec3 force = toTarget * uAttraction;
  force += curlNoise(pos.xyz * 0.8 + vec3(0.0, uTime * 0.2, 0.0)) * uCurl;
  vec3 away = pos.xyz - uPointer;
  float d = length(away);
  force += normalize(away + vec3(1e-4)) * uPointerStrength * smoothstep(uPointerRadius, 0.0, d);
  vel += force * uDelta;
  vel *= (1.0 - uDrag * uDelta);
  gl_FragColor = vec4(vel, 1.0);
}
`

export const positionKernel = /* glsl */ `
uniform float uDelta;
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 pos = texture2D(texturePosition, uv);
  vec3 vel = texture2D(textureVelocity, uv).xyz;
  pos.xyz += vel * uDelta;
  gl_FragColor = vec4(pos.xyz, pos.w);
}
`

export const pointsVertex = /* glsl */ `
attribute vec2 aRef;
uniform sampler2D uPositions;
uniform sampler2D uVelocities;
uniform float uSize;
uniform float uScale;
varying float vSpeed;
void main() {
  vec3 p = texture2D(uPositions, aRef).xyz;
  vSpeed = length(texture2D(uVelocities, aRef).xyz);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (uScale / max(0.1, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
}
`

export const pointsFragment = /* glsl */ `
uniform vec3 uColorSlow;
uniform vec3 uColorFast;
varying float vSpeed;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float alpha = smoothstep(1.0, 0.3, r);
  if (alpha < 0.01) discard;
  vec3 color = mix(uColorSlow, uColorFast, clamp(vSpeed * 0.5, 0.0, 1.0));
  gl_FragColor = vec4(color, alpha * 0.6);
}
`

export interface GpgpuOptions {
  /** texture side; particles = side² */
  side: number
  formationA: Float32Array
  formationB: Float32Array
  seed?: number
  colorSlow?: THREE.ColorRepresentation
  colorFast?: THREE.ColorRepresentation
  /** sprite size in world-ish units (gl_PointSize = size × 300 / depth); default 10 / side keeps the cloud readable at any count */
  pointSize?: number
}

export interface GpgpuSimulation {
  readonly side: number
  readonly count: number
  readonly points: THREE.Points
  readonly velocity: ReturnType<typeof defineUniforms<{ uDelta: number; uTime: number; uMorph: number; uAttraction: number; uCurl: number; uDrag: number; uPointer: THREE.Vector3; uPointerStrength: number; uPointerRadius: number }>>
  /** advances the simulation by delta seconds (clamped to 1/30) */
  compute(delta: number): void
  /** reads the current positions back (xyzw per particle); slow, for verification and debugging only */
  readPositions(): Float32Array
  /** draws the first n particles */
  setCount(n: number): void
  readonly drawn: number
  readonly steps: number
  dispose(): void
}

export function createGpgpuSimulation(renderer: THREE.WebGLRenderer, registry: ResourceRegistry, options: GpgpuOptions): GpgpuSimulation {
  const { side } = options
  const count = side * side
  const gpu = new GPUComputationRenderer(side, side, renderer)
  const random = mulberry32(options.seed ?? 3)
  const position0 = gpu.createTexture()
  const velocity0 = gpu.createTexture()
  const p = position0.image.data as Float32Array
  for (let i = 0; i < count; i++) {
    // start as a loose cloud around the first formation
    p[i * 4] = (options.formationA[i * 3] ?? 0) + (random() - 0.5) * 2
    p[i * 4 + 1] = (options.formationA[i * 3 + 1] ?? 0) + (random() - 0.5) * 2
    p[i * 4 + 2] = (options.formationA[i * 3 + 2] ?? 0) + (random() - 0.5) * 2
    p[i * 4 + 3] = 1
  }
  const positionVariable: Variable = gpu.addVariable('texturePosition', positionKernel, position0)
  const velocityVariable: Variable = gpu.addVariable('textureVelocity', velocityKernel, velocity0)
  gpu.setVariableDependencies(positionVariable, [positionVariable, velocityVariable])
  gpu.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable])
  const targetsA = registry.own(formationTexture(options.formationA, side), 'targets-a')
  const targetsB = registry.own(formationTexture(options.formationB, side), 'targets-b')
  const velocity = defineUniforms({ uDelta: 0, uTime: 0, uMorph: 0, uAttraction: 4, uCurl: 1.2, uDrag: 2.5, uPointer: new THREE.Vector3(1e3, 1e3, 1e3), uPointerStrength: 12, uPointerRadius: 1.5 })
  Object.assign(velocityVariable.material.uniforms, velocity, { uTargetsA: { value: targetsA }, uTargetsB: { value: targetsB } })
  const positionUniforms = defineUniforms({ uDelta: 0 })
  Object.assign(positionVariable.material.uniforms, positionUniforms)
  const error = gpu.init()
  if (error !== null) throw new Error(`GPUComputationRenderer: ${error}`)

  const geometry = registry.own(new THREE.BufferGeometry(), 'gpgpu-points-geometry')
  const refs = new Float32Array(count * 2)
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    refs[i * 2] = ((i % side) + 0.5) / side
    refs[i * 2 + 1] = (Math.floor(i / side) + 0.5) / side
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aRef', new THREE.BufferAttribute(refs, 2))
  geometry.setDrawRange(0, count)
  const pointUniforms = defineUniforms({ uPositions: null as THREE.Texture | null, uVelocities: null as THREE.Texture | null, uSize: options.pointSize ?? 10 / side, uScale: 300, uColorSlow: new THREE.Color(options.colorSlow ?? '#6ea8ff'), uColorFast: new THREE.Color(options.colorFast ?? '#ffd27a') })
  const material = registry.own(new THREE.ShaderMaterial({ vertexShader: pointsVertex, fragmentShader: pointsFragment, uniforms: pointUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 'gpgpu-points-material')
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  const readback = new Float32Array(count * 4)
  let steps = 0
  const sync = () => {
    pointUniforms.uPositions.value = gpu.getCurrentRenderTarget(positionVariable).texture
    pointUniforms.uVelocities.value = gpu.getCurrentRenderTarget(velocityVariable).texture
  }
  sync()
  return {
    side,
    count,
    points,
    velocity,
    compute(delta) {
      const dt = Math.min(1 / 30, Math.max(0, delta))
      velocity.uDelta.value = dt
      velocity.uTime.value += dt
      positionUniforms.uDelta.value = dt
      gpu.compute()
      steps++
      sync()
    },
    readPositions() {
      renderer.readRenderTargetPixels(gpu.getCurrentRenderTarget(positionVariable), 0, 0, side, side, readback)
      return readback
    },
    setCount(n) {
      geometry.setDrawRange(0, Math.max(0, Math.min(count, Math.floor(n))))
    },
    get drawn() {
      return geometry.drawRange.count === Infinity ? count : geometry.drawRange.count
    },
    get steps() {
      return steps
    },
    dispose() {
      gpu.dispose()
      position0.dispose()
      velocity0.dispose()
    },
  }
}
```

## 5. CPU baseline

The same forces integrated in JavaScript, writing a position attribute every frame. It is correct and simple; its cost per frame is linear in the count, which the lab measures next to the GPU versions.

```ts
// @verify creative:particles/cpu-simulation.ts nuxt:lib/lab/particles/cpu-simulation.ts next:lib/lab/particles/cpu-simulation.ts
import { mulberry32 } from './formations'

export interface CpuSimulationOptions {
  count: number
  formationA: Float32Array
  formationB: Float32Array
  seed?: number
  attraction?: number
  drag?: number
  curl?: number
}

export interface CpuSimulation {
  readonly count: number
  /** xyz per particle; upload as a BufferAttribute with needsUpdate after each step */
  readonly positions: Float32Array
  readonly velocities: Float32Array
  morph: number
  pointer: { x: number; y: number; z: number; strength: number; radius: number }
  /** integrates one step; returns the JavaScript time it took in ms */
  step(delta: number): number
  readonly steps: number
}

/** A cheap deterministic swirl standing in for curl noise on the CPU (the comparison is about where the work runs, not the noise). */
function swirl(x: number, y: number, z: number, t: number, out: [number, number, number]) {
  out[0] = Math.sin(y * 1.3 + t) * Math.cos(z * 0.9)
  out[1] = Math.sin(z * 1.1 - t * 0.7) * Math.cos(x * 0.8)
  out[2] = Math.sin(x * 1.2 + t * 0.5) * Math.cos(y * 1.1)
}

export function createCpuSimulation(options: CpuSimulationOptions): CpuSimulation {
  const { count } = options
  const random = mulberry32(options.seed ?? 3)
  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)
  for (let i = 0; i < count * 3; i++) positions[i] = (options.formationA[i] ?? 0) + (random() - 0.5) * 2
  const attraction = options.attraction ?? 4
  const drag = options.drag ?? 2.5
  const curl = options.curl ?? 1.2
  const force: [number, number, number] = [0, 0, 0]
  let time = 0
  let steps = 0
  const sim: CpuSimulation = {
    count,
    positions,
    velocities,
    morph: 0,
    pointer: { x: 1e3, y: 1e3, z: 1e3, strength: 12, radius: 1.5 },
    step(delta) {
      const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const dt = Math.min(1 / 30, Math.max(0, delta))
      time += dt
      const m = sim.morph
      const { x: px, y: py, z: pz, strength, radius } = sim.pointer
      for (let i = 0; i < count; i++) {
        const ix = i * 3
        const x = positions[ix]!
        const y = positions[ix + 1]!
        const z = positions[ix + 2]!
        const tx = (options.formationA[ix] ?? 0) * (1 - m) + (options.formationB[ix] ?? 0) * m
        const ty = (options.formationA[ix + 1] ?? 0) * (1 - m) + (options.formationB[ix + 1] ?? 0) * m
        const tz = (options.formationA[ix + 2] ?? 0) * (1 - m) + (options.formationB[ix + 2] ?? 0) * m
        swirl(x * 0.8, y * 0.8, z * 0.8, time * 0.2, force)
        let fx = (tx - x) * attraction + force[0] * curl
        let fy = (ty - y) * attraction + force[1] * curl
        let fz = (tz - z) * attraction + force[2] * curl
        const ax = x - px
        const ay = y - py
        const az = z - pz
        const d = Math.sqrt(ax * ax + ay * ay + az * az)
        if (d < radius) {
          const s = radius > 0 ? 1 - d / radius : 1
          const push = (strength * s * s * (3 - 2 * s)) / Math.max(d, 1e-4)
          fx += ax * push
          fy += ay * push
          fz += az * push
        }
        const k = 1 - drag * dt
        velocities[ix] = (velocities[ix]! + fx * dt) * k
        velocities[ix + 1] = (velocities[ix + 1]! + fy * dt) * k
        velocities[ix + 2] = (velocities[ix + 2]! + fz * dt) * k
        positions[ix] = x + velocities[ix]! * dt
        positions[ix + 1] = y + velocities[ix + 1]! * dt
        positions[ix + 2] = z + velocities[ix + 2]! * dt
      }
      steps++
      return (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start
    },
    get steps() {
      return steps
    },
  }
  return sim
}
```

## 6. Adaptive density

Quality is a ladder of tiers (particle count, pixel ratio, post tier). The controller watches an exponential moving average of the frame time and steps down after a sustained overrun, steps up only after a longer stable period, and never oscillates: hysteresis between the two thresholds and a cooldown after every change. It is pure logic (tested in Node); the lab feeds it the real frame times and applies the tier to `setCount` and `renderer.setPixelRatio`.

```ts
// @verify creative:particles/density-controller.ts nuxt:lib/lab/particles/density-controller.ts next:lib/lab/particles/density-controller.ts
export interface DensityTier {
  name: string
  /** fraction of the maximum particle count */
  density: number
  pixelRatio: number
}
export const DEFAULT_TIERS: DensityTier[] = [
  { name: 'ultra', density: 1, pixelRatio: 2 },
  { name: 'high', density: 0.6, pixelRatio: 1.5 },
  { name: 'medium', density: 0.35, pixelRatio: 1.25 },
  { name: 'low', density: 0.15, pixelRatio: 1 },
  { name: 'floor', density: 0.05, pixelRatio: 1 },
]

export interface DensityControllerOptions {
  tiers?: DensityTier[]
  /** target frame time in ms (16.7 for 60 Hz, 33 for 30 Hz on low-power devices) */
  budgetMs?: number
  /** frames over budget × 1.25 before stepping down */
  downAfter?: number
  /** frames under budget × 0.6 before stepping up */
  upAfter?: number
  /** frames to ignore after a change (the change itself costs a frame or two) */
  cooldown?: number
  /** EMA smoothing, 0..1 */
  smoothing?: number
  initial?: number
}

export interface DensityController {
  /** feeds one frame time; returns the tier if it changed, otherwise null */
  sample(frameMs: number): DensityTier | null
  readonly tier: DensityTier
  readonly index: number
  readonly average: number
  readonly history: { index: number; frame: number }[]
  /** pins a tier (a user toggle, reduced data); sampling resumes from it */
  set(index: number): DensityTier
}

export function createDensityController(options: DensityControllerOptions = {}): DensityController {
  const tiers = options.tiers ?? DEFAULT_TIERS
  const budget = options.budgetMs ?? 16.7
  const downAfter = options.downAfter ?? 20
  const upAfter = options.upAfter ?? 180
  const cooldown = options.cooldown ?? 30
  const smoothing = options.smoothing ?? 0.1
  let index = Math.min(tiers.length - 1, Math.max(0, options.initial ?? 0))
  let average = budget
  let over = 0
  let under = 0
  let cool = 0
  let frame = 0
  const history: { index: number; frame: number }[] = [{ index, frame: 0 }]
  const tierAt = (i: number): DensityTier => tiers[i] ?? tiers[tiers.length - 1] ?? { name: 'floor', density: 0.05, pixelRatio: 1 }
  const change = (next: number) => {
    index = next
    over = 0
    under = 0
    cool = cooldown
    history.push({ index, frame })
    return tierAt(index)
  }
  return {
    sample(frameMs) {
      frame++
      average += (frameMs - average) * smoothing
      if (cool > 0) {
        cool--
        return null
      }
      if (average > budget * 1.25) {
        over++
        under = 0
        if (over >= downAfter && index < tiers.length - 1) return change(index + 1)
      } else if (average < budget * 0.6) {
        under++
        over = 0
        if (under >= upAfter && index > 0) return change(index - 1)
      } else {
        over = 0
        under = 0
      }
      return null
    },
    get tier() {
      return tierAt(index)
    },
    get index() {
      return index
    },
    get average() {
      return average
    },
    history,
    set(i) {
      return change(Math.min(tiers.length - 1, Math.max(0, i)))
    },
  }
}
```

## 7. Interaction: pointer and scroll

The pointer is a world-space point: the page projects the cursor or touch onto the plane the particles live in (a `Raycaster` against a `Plane`, in the `input` phase) and writes `uPointer` once per frame; the kernels do the rest. On touch devices the last touch stays as the attractor until the next, so the field does not snap when the finger lifts. Scroll writes `uMorph` (the formation blend) and the pointer strength through the cue sheet, which is how "the product dissolves into dust as you scroll, and the dust becomes the logo" is one progress value.

## 8. Fallbacks

- No `EXT_color_buffer_float` (old mobile GPUs): `GPUComputationRenderer` with `HalfFloatType` textures, or the stateless instanced field, which needs no float targets at all.
- Low `MAX_VERTEX_TEXTURE_IMAGE_UNITS` or no WebGL 2: the CPU baseline at a few thousand particles with the same forces.
- `prefers-reduced-motion`: the simulation keeps running (particles must not freeze mid-air into noise) with `uCurl` 0, `uDrag` high and the pointer disabled, so the formation settles and stays; `timeScale` stays 1 for the settle and the morph follows navigation, not scroll.
- A lost context: the runtime stops the loop; on restore the simulation textures are gone and the system is rebuilt from the formations (GPGPU state is not restorable; a "dispersed and reforming" start is the graceful version).

## 9. Measurements and tests

Node (Vitest): formations have the right count and radius and are deterministic; the CPU simulation converges on its target with no curl and responds to the pointer; the controller steps down under sustained overrun, up only after a long stable run, and honours the cooldown; the kernels declare the uniforms the simulation sets.

```ts
// @verify creative:particles/particles.test.ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createCpuSimulation } from './cpu-simulation'
import { DEFAULT_TIERS, createDensityController } from './density-controller'
import { formationTexture, gridFormation, meanDistance, ringFormation, sphereFormation, surfaceFormation } from './formations'
import { positionKernel, velocityKernel } from './gpgpu-simulation'
import { instancedFieldVertex } from './instanced-field'

describe('formations', () => {
  it('place every particle at the requested radius, deterministically', () => {
    const sphere = sphereFormation(1000, 2)
    for (let i = 0; i < 1000; i++) expect(Math.hypot(sphere[i * 3]!, sphere[i * 3 + 1]!, sphere[i * 3 + 2]!)).toBeCloseTo(2, 6)
    const ring = ringFormation(500, 3, 0.2, 9)
    expect(ring).toEqual(ringFormation(500, 3, 0.2, 9))
    expect(Math.abs(Math.hypot(ring[0]!, ring[2]!) - 3)).toBeLessThan(0.11)
    const grid = gridFormation(100, 4, 4)
    expect(Math.min(...grid.filter((_, i) => i % 3 === 0))).toBeCloseTo(-2, 6)
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 64, 8))
    const surface = surfaceFormation(knot, 256, 5)
    expect(surface).toEqual(surfaceFormation(knot, 256, 5))
    for (let i = 0; i < 256; i++) expect(Math.hypot(surface[i * 3]!, surface[i * 3 + 1]!, surface[i * 3 + 2]!)).toBeLessThan(2) // on the knot's surface: radius 1, tube 0.3, plus the knot's excursion
    const texture = formationTexture(sphere, 32)
    expect(texture.image.width).toBe(32)
    expect((texture.image.data as Float32Array)[3]).toBe(1)
    expect(meanDistance(sphere, sphere, 1000)).toBe(0)
  })
})

describe('cpu simulation', () => {
  it('converges on its formation without turbulence and morphs to the second one', () => {
    const a = sphereFormation(400, 2)
    const b = gridFormation(400, 4, 4)
    const sim = createCpuSimulation({ count: 400, formationA: a, formationB: b, curl: 0 })
    const start = meanDistance(sim.positions, a, 400)
    for (let i = 0; i < 240; i++) sim.step(1 / 60)
    const settled = meanDistance(sim.positions, a, 400)
    expect(settled).toBeLessThan(start * 0.1)
    sim.morph = 1
    for (let i = 0; i < 240; i++) sim.step(1 / 60)
    expect(meanDistance(sim.positions, b, 400)).toBeLessThan(0.1)
    expect(sim.steps).toBe(480)
  })

  it('the pointer pushes particles out of its radius', () => {
    const a = sphereFormation(300, 1)
    const sim = createCpuSimulation({ count: 300, formationA: a, formationB: a, curl: 0 })
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    sim.pointer = { x: 1, y: 0, z: 0, strength: 30, radius: 1 }
    const before = nearPointer(sim.positions, 300, 0.5)
    for (let i = 0; i < 30; i++) sim.step(1 / 60)
    expect(nearPointer(sim.positions, 300, 0.5)).toBeLessThan(before)
    const ms = sim.step(1 / 60)
    expect(ms).toBeGreaterThanOrEqual(0)
  })
})

function nearPointer(positions: Float32Array, count: number, radius: number) {
  let n = 0
  for (let i = 0; i < count; i++) if (Math.hypot(positions[i * 3]! - 1, positions[i * 3 + 1]!, positions[i * 3 + 2]!) < radius) n++
  return n
}

describe('density controller', () => {
  it('steps down under sustained overrun, honours the cooldown, steps up only after a long calm', () => {
    const c = createDensityController({ budgetMs: 16.7, downAfter: 10, upAfter: 40, cooldown: 5, smoothing: 1 })
    expect(c.tier.name).toBe('ultra')
    const changes: string[] = []
    for (let i = 0; i < 9; i++) expect(c.sample(40)).toBeNull()
    changes.push(c.sample(40)!.name) // 10th overrun frame
    for (let i = 0; i < 5; i++) expect(c.sample(40)).toBeNull() // cooldown
    for (let i = 0; i < 9; i++) c.sample(40)
    changes.push(c.sample(40)!.name)
    expect(changes).toEqual(['high', 'medium'])
    for (let i = 0; i < 5; i++) c.sample(8)
    let up: string | null = null
    for (let i = 0; i < 39; i++) expect(c.sample(8)).toBeNull()
    up = c.sample(8)?.name ?? null
    expect(up).toBe('high')
    expect(c.history.map((h) => DEFAULT_TIERS[h.index]!.name)).toEqual(['ultra', 'high', 'medium', 'high'])
    for (let i = 0; i < 100; i++) c.sample(18) // inside the dead band: nothing moves
    expect(c.tier.name).toBe('high')
    expect(c.set(4).name).toBe('floor')
    expect(c.sample(40)).toBeNull() // already at the floor, cooldown anyway
  })
})

describe('kernels', () => {
  it('declare the uniforms the simulation drives and read the GPUComputationRenderer samplers', () => {
    for (const name of ['uDelta', 'uTime', 'uMorph', 'uAttraction', 'uCurl', 'uDrag', 'uPointer', 'uPointerStrength', 'uPointerRadius', 'uTargetsA', 'uTargetsB']) expect(velocityKernel).toContain(`uniform`), expect(velocityKernel).toMatch(new RegExp(`uniform\\s+\\w+\\s+${name};`))
    expect(velocityKernel).toContain('texturePosition')
    expect(velocityKernel).toContain('textureVelocity')
    expect(positionKernel).toMatch(/uniform\s+float\s+uDelta;/)
    for (const name of ['aSeed', 'aHomeA', 'aHomeB']) expect(instancedFieldVertex).toMatch(new RegExp(`attribute\\s+vec3\\s+${name};`))
    expect(instancedFieldVertex).toContain('uMorph')
  })
})
```

Browser (`/lab/particles`): the GPGPU simulation's positions read back from the float target change between steps and the mean distance to the formation falls with attraction on and turbulence off; at `uMorph` 1 the particles sit on the second formation (sampled from a torus knot surface); a pointer placed in the cloud empties its radius; the instanced field draws its count in one call with `instanceCount` as the knob; the CPU baseline's JavaScript time per frame grows with the count while the two GPU versions' JavaScript time stays flat; the controller fed with real frame times lands on a tier and the tier changes the drawn count and the pixel ratio; a context loss forced through `WEBGL_lose_context` stops the loop and a restore resumes it with the system rebuilt; the page disposes to zero geometries and textures. The numbers come from SwiftShader (a software renderer): they compare the three modes against each other on the same machine and say nothing about frame rates on real GPUs.
