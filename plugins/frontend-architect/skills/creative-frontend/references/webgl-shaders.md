# WebGL, shaders and WebGPU

## Contents
- When to write shaders
- ShaderMaterial pattern
- Post-processing
- WebGPU
- Performance

## When to write shaders

Custom distortion, noise-driven backgrounds, dissolves, displacement, GPU particles, stylized materials. Before writing GLSL, check whether a built-in material with maps, drei/cientos helpers, or a post-processing pass already does it.

## ShaderMaterial pattern

```ts
// @verify creative:three/noise-material.ts
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    float n = noise(vUv * 4.0 + uTime * 0.15);
    gl_FragColor = vec4(mix(uColorA, uColorB, n), 1.0);
  }
`

export function createNoiseMaterial(colorA = '#0b0b12', colorB = '#4f46e5') {
  const uniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(colorA) },
    uColorB: { value: new THREE.Color(colorB) },
  }
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms })
  return {
    material,
    /** Call from the render loop; pass 0 to freeze for reduced motion. */
    update: (delta: number) => {
      uniforms.uTime.value += delta
    },
  }
}
```

Rules:
- Uniforms for anything that changes; never rebuild the material per frame.
- Keep fragment shaders cheap: they run per pixel. Reduce resolution (render targets at half size) for full-screen effects.
- Test on mobile GPUs; precision and performance differ.
- Store shaders as `.glsl` files with a Vite plugin when they grow, and share chunks (noise functions) between shaders.

## Post-processing

`pmndrs/postprocessing` (used by `@react-three/postprocessing`) merges passes efficiently; prefer it over chaining many `EffectComposer` passes. Every pass costs a full-screen draw: bloom, depth of field and SSAO are expensive on mobile; make them optional by quality tier.

## WebGPU

Three.js ships a WebGPU renderer with TSL (Three Shading Language) and falls back to WebGL. Choose WebGPU only for a measured need (compute shaders, very large particle counts) with a tested fallback; check browser support for your audience before committing in an ADR.

## Performance

- Frame budget: 16.7 ms at 60 Hz, less on 120 Hz displays. Measure on a mid-range phone.
- Avoid shader compilation stutter: warm up materials during loading (`renderer.compile`).
- Watch texture memory and dispose render targets you create.
