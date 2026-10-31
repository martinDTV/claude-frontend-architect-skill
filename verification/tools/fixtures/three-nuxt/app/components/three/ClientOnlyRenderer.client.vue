<script setup lang="ts">
import * as THREE from 'three'

// A .client.vue component never renders on the server: the top-level renderer is allowed here.
const renderer = new THREE.WebGLRenderer()
renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault())
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera()
const host = ref<HTMLElement | null>(null)

onMounted(() => {
  host.value?.appendChild(renderer.domElement)
  renderer.setAnimationLoop(() => renderer.render(scene, camera))
})
onBeforeUnmount(() => {
  renderer.setAnimationLoop(null)
  renderer.dispose()
})
</script>

<template>
  <div ref="host" aria-hidden="true" />
</template>
