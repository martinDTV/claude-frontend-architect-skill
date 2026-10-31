<script setup lang="ts">
import * as THREE from 'three'

// Everything created in onMounted, disposed in onBeforeUnmount, loop stopped, context loss handled, DPR clamped.
const canvas = ref<HTMLCanvasElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let geometry: THREE.BufferGeometry | null = null
let material: THREE.Material | null = null
const onLost = (event: Event) => {
  event.preventDefault()
  renderer?.setAnimationLoop(null)
}

onMounted(() => {
  if (!canvas.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.z = 5
  geometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 16)
  material = new THREE.MeshStandardMaterial({ color: '#8b5cf6' })
  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh, new THREE.DirectionalLight(0xffffff, 2))
  canvas.value.addEventListener('webglcontextlost', onLost)
  renderer.setAnimationLoop((time) => {
    mesh.rotation.y = time * 0.0005
    renderer?.render(scene, camera)
  })
})

onBeforeUnmount(() => {
  canvas.value?.removeEventListener('webglcontextlost', onLost)
  renderer?.setAnimationLoop(null)
  geometry?.dispose()
  material?.dispose()
  renderer?.dispose()
})
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" />
</template>
