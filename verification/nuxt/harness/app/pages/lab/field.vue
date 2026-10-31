<script setup lang="ts">
// Reference experience B: GPU particles. Scroll drives the formation; the pointer pushes particles; the range sets density.
const container = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const controls = ref<HTMLElement | null>(null)
const status = ref('loading')
let dispose: (() => void) | null = null
onMounted(async () => {
  if (!container.value || !canvas.value || !controls.value) return
  const { mountFieldPage } = await import('~/lib/lab/labs/pages')
  dispose = await mountFieldPage({ container: container.value, canvas: canvas.value, controls: controls.value, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches })
  status.value = 'ready'
})
onBeforeUnmount(() => {
  dispose?.()
  dispose = null
})
</script>

<template>
  <main>
    <h1 class="sr-title">GPU particle experience</h1>
    <p data-status>{{ status }}</p>
    <div ref="container" class="story" style="height: 300vh">
      <div class="pin">
        <div ref="controls" class="stage" aria-hidden="true">
          <canvas ref="canvas" class="stage-canvas" />
        </div>
        <p class="caption">Sixteen thousand particles find a sphere, scatter, and settle on the emblem as you scroll. Move the pointer through them.</p>
        <label class="density">Density <input type="range" data-density min="2" max="100" value="35"></label>
      </div>
    </div>
  </main>
</template>

<style scoped>
.sr-title { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.pin { position: sticky; top: 0; height: 100vh; overflow: hidden; }
.stage { position: absolute; inset: 0; }
.stage-canvas { display: block; width: 100%; height: 100%; }
.caption { position: absolute; left: 1.5rem; bottom: 4rem; max-width: 24rem; color: #dfe6ff; }
.density { position: absolute; right: 1.5rem; bottom: 1.5rem; color: #dfe6ff; }
</style>
