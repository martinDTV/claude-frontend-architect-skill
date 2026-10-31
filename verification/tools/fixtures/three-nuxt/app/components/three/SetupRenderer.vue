<script setup lang="ts">
import * as THREE from 'three'

// A renderer at the top level of <script setup>: it runs during server rendering, where there is no canvas.
const renderer = new THREE.WebGLRenderer()
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera()
const canvas = ref<HTMLCanvasElement | null>(null)

onMounted(() => {
  renderer.setAnimationLoop(() => renderer.render(scene, camera))
})
onBeforeUnmount(() => {
  renderer.setAnimationLoop(null)
  renderer.dispose()
})
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" />
</template>
