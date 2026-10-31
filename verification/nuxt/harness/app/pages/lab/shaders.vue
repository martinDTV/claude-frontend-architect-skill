<script setup lang="ts">
// Shader lab page: mounts the lab on the client only (the module touches WebGL at mount, never at import, but the
// WebGPU build is heavy and has no place in the server bundle). Disposed on route leave.
const glCanvas = ref<HTMLCanvasElement | null>(null)
const tslCanvas = ref<HTMLCanvasElement | null>(null)
const status = ref('loading')
let lab: { dispose: () => void } | null = null

onMounted(async () => {
  if (!glCanvas.value || !tslCanvas.value) return
  const { mountShaderLab } = await import('~/lib/lab/labs/shaders-lab')
  lab = await mountShaderLab(glCanvas.value, tslCanvas.value)
  status.value = 'ready'
})
onBeforeUnmount(() => {
  lab?.dispose()
  lab = null
})
</script>

<template>
  <main class="lab">
    <h1>Shader lab</h1>
    <p data-status>{{ status }}</p>
    <canvas ref="glCanvas" class="lab-canvas" aria-label="GLSL materials and post-processing" />
    <canvas ref="tslCanvas" class="lab-canvas lab-canvas--small" aria-label="TSL node materials on the WebGL 2 backend" />
  </main>
</template>

<style scoped>
.lab { padding: 1rem; }
.lab-canvas { display: block; width: 100%; max-width: 640px; aspect-ratio: 16 / 9; background: #0b0b12; }
.lab-canvas--small { max-width: 256px; aspect-ratio: 1; margin-top: 1rem; }
</style>
