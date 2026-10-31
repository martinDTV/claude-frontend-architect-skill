<script setup lang="ts">
// Reference experience A: cinematic product. The experience is created on the client after mount, bound to scroll,
// keys and the DOM controls by the shared page controller, and disposed on route leave.
const container = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const controls = ref<HTMLElement | null>(null)
const status = ref('loading')
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
  const { mountProductPage } = await import('~/lib/lab/labs/pages')
  dispose = await mountProductPage({ container: container.value, canvas: canvas.value, controls: controls.value, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, onCaption: (id, on) => { active.value = { ...active.value, [id]: on } } })
  status.value = 'ready'
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
    <div ref="container" class="story" style="height: 400vh">
      <div class="pin">
        <div ref="controls" class="stage" tabindex="0" role="group" aria-label="Product viewer. In explore mode the arrow keys orbit the camera.">
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
.stage:focus-visible { outline: 3px solid #ffd27a; outline-offset: -3px; }
.stage-canvas { display: block; width: 100%; height: 100%; }
.captions { position: absolute; left: 1.5rem; bottom: 5rem; margin: 0; padding: 0; list-style: none; max-width: 22rem; color: #f2efe6; }
.captions li { opacity: 0; transition: opacity 0.4s; padding: 0.75rem 1rem; border-radius: 6px; background: linear-gradient(90deg, rgba(8, 8, 12, 0.84), rgba(8, 8, 12, 0.6)); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); }
.captions li[data-active='true'] { opacity: 1; }
.captions li:not([data-active='true']) { position: absolute; }
.configurator { position: absolute; right: 1.5rem; bottom: 1.5rem; display: flex; gap: 0.75rem; align-items: center; color: #f2efe6; }
.configurator select, .configurator button { min-height: 32px; }
</style>
