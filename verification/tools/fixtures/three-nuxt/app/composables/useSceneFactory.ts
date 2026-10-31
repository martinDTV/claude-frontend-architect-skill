import * as THREE from 'three'

/** A factory: creates, runs and returns the disposal; the component that calls it owns the lifecycle. */
export function createStage(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  const onLost = (event: Event) => {
    event.preventDefault()
    renderer.setAnimationLoop(null)
  }
  canvas.addEventListener('webglcontextlost', onLost)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 32)
  const material = new THREE.MeshStandardMaterial({ color: '#f59e0b' })
  scene.add(new THREE.Mesh(geometry, material))
  renderer.setAnimationLoop(() => renderer.render(scene, camera))
  return {
    scene,
    camera,
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost)
      renderer.setAnimationLoop(null)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    },
  }
}
