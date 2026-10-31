<script setup lang="ts">
import * as THREE from 'three'

// Correct lifecycle, but the pixel ratio follows the device with no ceiling.
const canvas = ref<HTMLCanvasElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let geometry: THREE.BufferGeometry | null = null

onMounted(() => {
  if (!canvas.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvas.value })
  renderer.setPixelRatio(window.devicePixelRatio)
  canvas.value.addEventListener('webglcontextlost', (e) => e.preventDefault())
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  geometry = new THREE.BoxGeometry()
  scene.add(new THREE.Mesh(geometry, new THREE.MeshNormalMaterial()))
  renderer.setAnimationLoop(() => renderer?.render(scene, camera))
})

onBeforeUnmount(() => {
  renderer?.setAnimationLoop(null)
  geometry?.dispose()
  renderer?.dispose()
})
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" />
</template>
