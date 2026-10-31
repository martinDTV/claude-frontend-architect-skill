<script setup lang="ts">
import * as THREE from 'three'

// A loop started on mount with no unmount hook at all: it renders after the component is gone.
const canvas = ref<HTMLCanvasElement | null>(null)

onMounted(() => {
  if (!canvas.value) return
  const renderer = new THREE.WebGLRenderer({ canvas: canvas.value })
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()))
  renderer.setAnimationLoop(() => renderer.render(scene, camera))
})
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" />
</template>
