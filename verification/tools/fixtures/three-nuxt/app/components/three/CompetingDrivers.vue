<script setup lang="ts">
import * as THREE from 'three'
import gsap from 'gsap'

// GSAP tweens camera.position while the frame loop also writes camera.position.x: two drivers for one property.
const canvas = ref<HTMLCanvasElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let tween: gsap.core.Tween | null = null

onMounted(() => {
  if (!canvas.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvas.value })
  canvas.value.addEventListener('webglcontextlost', (e) => e.preventDefault())
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  tween = gsap.to(camera.position, { z: 8, duration: 2 })
  renderer.setAnimationLoop((time) => {
    camera.position.x = Math.sin(time * 0.001) * 2
    renderer?.render(scene, camera)
  })
})

onBeforeUnmount(() => {
  tween?.kill()
  renderer?.setAnimationLoop(null)
  renderer?.dispose()
})
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" />
</template>
