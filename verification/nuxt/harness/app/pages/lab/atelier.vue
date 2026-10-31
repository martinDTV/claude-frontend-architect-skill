<script setup lang="ts">
// Reference experience D: the product story on an imported GLB (asset cache, exploded view, dust reconstruction, configurator).
const container = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const controls = ref<HTMLElement | null>(null)
const status = ref('loading')
const active = ref<Record<string, boolean>>({})
const chapters = [
  { id: 'hero', title: 'Atelier', text: 'A small speaker, turned and lacquered, lit the way the room lights it.' },
  { id: 'exploded', title: 'Every part', text: 'Base, body, grille, plate, knob: each one made to be seen on its own.' },
  { id: 'dust', title: 'Made of light', text: 'The parts dissolve into dust that remembers their shape, and settles back.' },
  { id: 'choose', title: 'Yours', text: 'Three finishes, two grilles. Turn it, pick a part, make it yours.' },
]
let dispose: (() => void) | null = null
onMounted(async () => {
  if (!container.value || !canvas.value || !controls.value) return
  const { mountAtelierPage } = await import('~/lib/lab/labs/pages')
  dispose = await mountAtelierPage({ container: container.value, canvas: canvas.value, controls: controls.value, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, onCaption: (id, on) => { active.value = { ...active.value, [id]: on } } })
  status.value = 'ready'
})
onBeforeUnmount(() => {
  dispose?.()
  dispose = null
})
</script>

<template>
  <main>
    <h1 class="sr-title">Atelier: the product story</h1>
    <p data-status>{{ status }}</p>
    <div ref="container" class="story" style="height: 500vh" tabindex="0" role="group" aria-label="Product story. Arrow keys, Page Up and Page Down move between chapters; in explore mode the arrows orbit.">
      <div class="pin">
        <div ref="controls" class="stage">
          <canvas ref="canvas" class="stage-canvas" aria-hidden="true" />
        </div>
        <nav class="chapters" aria-label="Chapters">
          <button v-for="c in chapters" :key="c.id" type="button" :data-chapter="c.id">{{ c.title }}</button>
          <p data-live aria-live="polite" class="sr-title" />
        </nav>
        <ol class="captions">
          <li v-for="c in chapters" :key="c.id" :data-caption="c.id" :data-active="active[c.id] ? 'true' : 'false'" :aria-current="active[c.id] ? 'step' : undefined">
            <h2>{{ c.title }}</h2>
            <p>{{ c.text }}</p>
          </li>
        </ol>
        <form class="configurator" aria-label="Configure the speaker" @submit.prevent>
          <label>Finish <select data-option="finish" /></label>
          <label>Grille <select data-option="grille" /></label>
          <button type="button" data-explore aria-pressed="false">Explore</button>
          <span data-selected>Nothing selected</span>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
.sr-title { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.story:focus-visible { outline: 3px solid #ffd27a; outline-offset: -3px; }
.pin { position: sticky; top: 0; height: 100vh; overflow: hidden; }
.stage { position: absolute; inset: 0; }
.stage-canvas { display: block; width: 100%; height: 100%; }
.chapters { position: absolute; top: 1rem; right: 1.5rem; display: flex; gap: 0.5rem; }
.chapters button { min-height: 32px; }
.chapters button[aria-current='step'] { outline: 2px solid #ffd27a; }
.captions { position: absolute; left: 1.5rem; bottom: 5rem; margin: 0; padding: 0; list-style: none; max-width: 24rem; color: #f2efe6; }
.captions li { opacity: 0; transition: opacity 0.4s; padding: 0.75rem 1rem; border-radius: 6px; background: linear-gradient(90deg, rgba(8, 8, 12, 0.84), rgba(8, 8, 12, 0.6)); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); }
.captions li[data-active='true'] { opacity: 1; }
.captions li:not([data-active='true']) { position: absolute; }
.configurator { position: absolute; right: 1.5rem; bottom: 1.5rem; display: flex; gap: 0.75rem; align-items: center; color: #f2efe6; }
.configurator select, .configurator button { min-height: 32px; }
</style>
