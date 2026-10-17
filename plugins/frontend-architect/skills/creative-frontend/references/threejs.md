# Three.js

Verified: `three` 0.186 on npm. Three.js has no semver: read the migration notes between releases.

## Contents
- When to use it
- Renderer setup
- Assets
- Performance
- Disposal

## When to use it

Real-time 3D, product configurators, interactive scenes, particle systems, custom shader effects. Not for flat parallax, gradients or simple tilt effects (CSS) or icon animation (SVG, Lottie, Rive).

In Vue use TresJS (`tresjs.md`); in React use React Three Fiber (`react-three-fiber.md`). Use plain Three.js for framework-agnostic modules or when integrating into a non-reactive page.

## Renderer setup

```ts
// @verify creative:three/create-scene.ts
import * as THREE from 'three'

export interface SceneHandle {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  dispose: () => void
}

/** Creates a renderer bound to `canvas`, resizes with its container, pauses when hidden. */
export function createScene(canvas: HTMLCanvasElement, onFrame: (delta: number) => void): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(0, 0, 5)

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas
    if (w === 0 || h === 0) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  const timer = new THREE.Timer()
  const loop = (time: number) => {
    timer.update(time)
    onFrame(timer.getDelta())
    renderer.render(scene, camera)
  }
  renderer.setAnimationLoop(loop)

  const onVisibility = () => renderer.setAnimationLoop(document.hidden ? null : loop)
  document.addEventListener('visibilitychange', onVisibility)

  return {
    scene,
    camera,
    renderer,
    dispose: () => {
      document.removeEventListener('visibilitychange', onVisibility)
      observer.disconnect()
      renderer.setAnimationLoop(null)
      disposeObject(scene)
      renderer.dispose()
    },
  }
}

/** Frees GPU memory held by every mesh under `root`. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  })
}
```

## Assets

- Models as glTF/GLB, compressed: Draco or Meshopt for geometry, KTX2 (Basis) for textures. Use `gltf-transform` to optimize before shipping.
- Textures power-of-two where possible, sized for the display (do not ship 4K textures for a 400 px canvas).
- Load with a progress indicator; show a poster image until the scene is ready (it is also the LCP candidate and the no-WebGL fallback).

## Performance

- Budget draw calls (aim for low hundreds on mobile): merge static geometry, use `InstancedMesh` for repeated objects.
- Clamp pixel ratio to 2; consider 1.5 on mobile and adaptive quality when frame time exceeds budget.
- Bake lighting and shadows into textures where possible; real-time shadows are expensive.
- Render on demand for static scenes (render only after interaction or change).
- Pause when the canvas is off-screen (IntersectionObserver) or the tab is hidden.
- Profile with the browser Performance panel and `renderer.info` (calls, triangles, textures).

## Disposal

GPU memory is not garbage-collected. On unmount: stop the loop, dispose geometries, materials, textures and render targets, remove listeners, call `renderer.dispose()`. TresJS and React Three Fiber dispose objects they created; dispose manually anything you created imperatively.
