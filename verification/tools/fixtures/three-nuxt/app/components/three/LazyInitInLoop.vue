<script setup lang="ts">
import * as THREE from 'three'

// A mesh created inside the loop behind a null check: a one-time lazy init, reported as heuristic only.
const canvas = ref<HTMLCanvasElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let mesh: THREE.Mesh | null = null

onMounted(() => {
  if (!canvas.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvas.value })
  canvas.value.addEventListener('webglcontextlost', (e) => e.preventDefault())
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  renderer.setAnimationLoop(() => {
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshNormalMaterial())
      scene.add(mesh)
    }
    renderer?.render(scene, camera)
  })
})

onBeforeUnmount(() => {
  renderer?.setAnimationLoop(null)
  mesh?.geometry.dispose()
  renderer?.dispose()
})
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" />
</template>
