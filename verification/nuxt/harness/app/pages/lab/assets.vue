<script setup lang="ts">
// Asset lab page: loaders and decoders exist only on the client; the module is imported after mount.
const glCanvas = ref<HTMLCanvasElement | null>(null)
const status = ref('loading')
let lab: { dispose: () => void } | null = null
onMounted(async () => {
  if (!glCanvas.value) return
  const { mountAssetsLab } = await import('~/lib/lab/labs/assets-lab')
  lab = await mountAssetsLab(glCanvas.value)
  status.value = 'ready'
})
onBeforeUnmount(() => {
  lab?.dispose()
  lab = null
})
</script>

<template>
  <main class="lab">
    <h1>Asset lab</h1>
    <p data-status>{{ status }}</p>
    <canvas ref="glCanvas" class="lab-canvas" aria-label="GLTF fixtures loaded through the asset cache" />
  </main>
</template>

<style scoped>
.lab { padding: 1rem; }
.lab-canvas { display: block; width: 100%; max-width: 640px; aspect-ratio: 16 / 9; background: #111218; }
</style>
