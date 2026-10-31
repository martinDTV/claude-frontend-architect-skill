<script setup lang="ts">
// Reference experience B: GPU particles. Scroll drives the formation; the pointer pushes particles; the range sets density.
const container = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const controls = ref<HTMLElement | null>(null)
const status = ref('loading')
const problem = ref<string | null>(null)
let dispose: (() => void) | null = null
onMounted(async () => {
  if (!container.value || !canvas.value || !controls.value) return
  try {
    const { mountFieldPage } = await import('~/lib/lab/labs/pages')
  dispose = await mountFieldPage({ container: container.value, canvas: canvas.value, controls: controls.value, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches })
    status.value = 'ready'
  } catch (error) {
    // no WebGL context: the DOM alternative; anything else: the error, named
    const e = error as Error
    status.value = e.name === 'WebGLUnavailable' ? 'unsupported' : 'error'
    problem.value = e.message
  }
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
    <p v-if="problem" role="alert" data-problem class="problem">{{ status === 'unsupported' ? 'This browser cannot show the 3D scene. The chapters are listed below.' : 'The scene could not be loaded: ' + problem }}</p>
    <div ref="container" :class="{ fallback: status === 'unsupported' }" class="story" style="height: 300vh">
      <div class="pin">
        <div ref="controls" class="stage" aria-hidden="true">
          <canvas ref="canvas" class="stage-canvas" />
        </div>
        <p class="caption" data-caption="field">Sixteen thousand particles find a sphere, scatter, and settle on the emblem as you scroll. Move the pointer through them.</p>
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
.caption { position: absolute; left: 1.5rem; bottom: 4rem; max-width: min(24rem, calc(100% - 3rem)); color: #dfe6ff; padding: 0.75rem 1rem; border-radius: 6px; background: rgba(8, 8, 12, 0.9); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); }
.density { position: absolute; right: 1.5rem; bottom: 1.5rem; max-width: calc(100% - 3rem); color: #dfe6ff; padding: 0.5rem 0.75rem; border-radius: 6px; background: rgba(8, 8, 12, 0.9); }
.problem { margin: 0.5rem 1rem; color: #1c1c22; }
/* no WebGL: the chapters stand in the flow as a readable list, the canvas and the controls that drive it are gone */
.fallback { height: auto !important; }
.fallback .pin { position: static; height: auto; overflow: visible; }
.fallback .stage, .fallback .stage-canvas, .fallback .configurator, .fallback .chapters, .fallback .density { display: none; }
.fallback .captions, .fallback .caption { position: static; max-width: 36rem; margin: 1rem; color: #1c1c22; }
.fallback .captions li, .fallback .caption { opacity: 1; position: static; transition: none; margin-bottom: 0.75rem; background: #f4f1ea; text-shadow: none; }
</style>
