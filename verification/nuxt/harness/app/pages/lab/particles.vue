<script setup lang="ts">
// Particle lab page: mounts the lab on the client only (the module touches WebGL at mount, never at import, but the
// WebGPU build is heavy and has no place in the server bundle). Disposed on route leave.
const glCanvas = ref<HTMLCanvasElement | null>(null)
const status = ref('loading')
let lab: { dispose: () => void } | null = null

onMounted(async () => {
  if (!glCanvas.value) return
  const { mountParticlesLab } = await import('~/lib/lab/labs/particles-lab')
  lab = await mountParticlesLab(glCanvas.value)
  status.value = 'ready'
})
onBeforeUnmount(() => {
  lab?.dispose()
  lab = null
})
</script>

<template>
  <main class="lab">
    <h1>Particle lab</h1>
    <p data-status>{{ status }}</p>
    <canvas ref="glCanvas" class="lab-canvas" aria-label="GPU particle simulation" />
  </main>
</template>

<style scoped>
.lab { padding: 1rem; }
.lab-canvas { display: block; width: 100%; max-width: 640px; aspect-ratio: 16 / 9; background: #0b0b12; }
</style>
