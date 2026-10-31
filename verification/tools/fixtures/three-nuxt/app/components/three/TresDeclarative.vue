<script setup lang="ts">
import * as THREE from 'three'
import { TresCanvas, useLoop } from '@tresjs/core'

// Declarative TresJS: the framework owns the geometry and material; the frame callback only writes transforms
// and allocates a math object (not a GPU resource).
const mesh = shallowRef<THREE.Mesh | null>(null)
const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  if (!mesh.value) return
  mesh.value.rotation.y += delta * 0.5
  const offset = new THREE.Vector3(0, Math.sin(delta), 0)
  mesh.value.position.add(offset)
})
</script>

<template>
  <TresCanvas clear-color="#0b0b12" :dpr="[1, 2]">
    <TresPerspectiveCamera :position="[3, 2, 4]" />
    <TresMesh ref="mesh">
      <TresBoxGeometry :args="[1, 1, 1]" />
      <TresMeshStandardMaterial color="#4f46e5" />
    </TresMesh>
    <TresDirectionalLight :position="[3, 4, 5]" :intensity="1.2" />
  </TresCanvas>
</template>
