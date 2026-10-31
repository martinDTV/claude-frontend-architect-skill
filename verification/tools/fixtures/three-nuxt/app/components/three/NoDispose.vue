<script setup lang="ts">
import * as THREE from 'three'

// The loop is stopped on unmount but nothing disposes the geometry, material, texture or renderer.
const canvas = ref<HTMLCanvasElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null

onMounted(() => {
  if (!canvas.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvas.value })
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: texture }))
  scene.add(mesh)
  renderer.setAnimationLoop(() => renderer?.render(scene, camera))
})

onBeforeUnmount(() => {
  renderer?.setAnimationLoop(null)
})
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" />
</template>
