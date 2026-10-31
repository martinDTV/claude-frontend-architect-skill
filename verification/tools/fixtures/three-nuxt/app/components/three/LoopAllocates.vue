<script setup lang="ts">
import * as THREE from 'three'

// The frame loop allocates a geometry and a material every frame and flags the material for recompilation.
const canvas = ref<HTMLCanvasElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null

onMounted(() => {
  if (!canvas.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvas.value })
  canvas.value.addEventListener('webglcontextlost', (e) => e.preventDefault())
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  const material = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } } })
  renderer.setAnimationLoop((time) => {
    const geometry = new THREE.SphereGeometry(1, 32, 16)
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
    material.uniforms.uTime = { value: time }
    material.needsUpdate = true
    scene.add(mesh)
    renderer?.render(scene, camera)
  })
})

onBeforeUnmount(() => {
  renderer?.setAnimationLoop(null)
  renderer?.dispose()
})
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" />
</template>
