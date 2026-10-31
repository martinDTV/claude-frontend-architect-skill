<script setup lang="ts">
// Reference experience A: cinematic product. The experience is created on the client after mount, bound to scroll,
// keys and the DOM controls by the shared page controller, and disposed on route leave.
const container = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const controls = ref<HTMLElement | null>(null)
const status = ref('loading')
const problem = ref<string | null>(null)
const active = ref<Record<string, boolean>>({})
const captions = [
  { id: 'establishing', title: 'Eau de verre', text: 'A bottle of clear glass, a liquid of amber, a cap of brushed steel.' },
  { id: 'cap', title: 'The cap', text: 'Turned from one piece, lacquered collar, no seam.' },
  { id: 'low', title: 'From below', text: 'The liquid holds the light the way the room gives it.' },
  { id: 'reverse', title: 'Choose yours', text: 'Three colours, two finishes, one bottle.' },
]
let dispose: (() => void) | null = null
onMounted(async () => {
  if (!container.value || !canvas.value || !controls.value) return
  try {
    const { mountProductPage } = await import('~/lib/lab/labs/pages')
  dispose = await mountProductPage({ container: container.value, canvas: canvas.value, controls: controls.value, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, onCaption: (id, on) => { active.value = { ...active.value, [id]: on } } })
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
    <h1 class="sr-title">Cinematic product experience</h1>
    <p data-status>{{ status }}</p>
    <p v-if="problem" role="alert" data-problem class="problem">{{ status === 'unsupported' ? 'This browser cannot show the 3D scene. The chapters are listed below.' : 'The scene could not be loaded: ' + problem }}</p>
    <div ref="container" :class="{ fallback: status === 'unsupported' }" class="story" style="height: 400vh">
      <div class="pin">
        <div ref="controls" class="stage" data-focus-ring tabindex="0" role="group" aria-label="Product viewer. In explore mode the arrow keys orbit the camera.">
          <canvas ref="canvas" class="stage-canvas" aria-hidden="true" />
        </div>
        <ol class="captions" aria-label="Chapters">
          <li v-for="c in captions" :key="c.id" :data-caption="c.id" :data-active="active[c.id] ? 'true' : 'false'" :aria-current="active[c.id] ? 'step' : undefined">
            <h2>{{ c.title }}</h2>
            <p>{{ c.text }}</p>
          </li>
        </ol>
        <form class="configurator" aria-label="Configure the bottle" @submit.prevent>
          <label>Finish <select data-option="finish" /></label>
          <label>Colour <select data-option="color" /></label>
          <button type="button" data-explore aria-pressed="false">Explore</button>
          <button type="button" data-seek="0">Start</button>
          <button type="button" data-seek="1">End</button>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
.sr-title { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.pin { position: sticky; top: 0; height: 100vh; overflow: hidden; }
.stage { position: absolute; inset: 0; }
.stage:focus-visible { outline: none; }
.stage:focus-visible::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 5; box-shadow: inset 0 0 0 3px #ffd27a, inset 0 0 0 10px rgba(8, 8, 12, 0.9); }
.stage-canvas { display: block; width: 100%; height: 100%; }
.captions { position: absolute; left: 1.5rem; bottom: 5rem; margin: 0; padding: 0; list-style: none; max-width: min(22rem, calc(100% - 3rem)); color: #f2efe6; }
.captions li { opacity: 0; transition: opacity 0.4s; padding: 0.75rem 1rem; border-radius: 6px; background: rgba(8, 8, 12, 0.9); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); }
.captions li[data-active='true'] { opacity: 1; }
.captions li:not([data-active='true']) { position: absolute; }
.configurator { position: absolute; right: 1.5rem; bottom: 1.5rem; display: flex; flex-wrap: wrap; justify-content: flex-end; max-width: calc(100% - 3rem); gap: 0.75rem; align-items: center; color: #f2efe6; padding: 0.5rem 0.75rem; border-radius: 6px; background: rgba(8, 8, 12, 0.9); }
.configurator select, .configurator button { min-height: 32px; }
.problem { margin: 0.5rem 1rem; color: #1c1c22; }
/* no WebGL: the chapters stand in the flow as a readable list, the canvas and the controls that drive it are gone */
.fallback { height: auto !important; }
.fallback .pin { position: static; height: auto; overflow: visible; }
.fallback .stage, .fallback .stage-canvas, .fallback .configurator, .fallback .chapters, .fallback .density { display: none; }
.fallback .captions, .fallback .caption { position: static; max-width: 36rem; margin: 1rem; color: #1c1c22; }
.fallback .captions li, .fallback .caption { opacity: 1; position: static; transition: none; margin-bottom: 0.75rem; background: #f4f1ea; text-shadow: none; }
</style>
