<script setup lang="ts">
// Reference experience C: immersive story. Three chapters, keyboard and buttons, hash deep links, captions in the DOM.
const container = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const controls = ref<HTMLElement | null>(null)
const status = ref('loading')
const active = ref<Record<string, boolean>>({})
const chapters = [
  { id: 'arrival', title: 'Arrival', text: 'Monoliths in a field at dawn; the path leads inward.' },
  { id: 'hall', title: 'The hall', text: 'Pillars of light stand in a ring; the floor gives way.' },
  { id: 'artefact', title: 'The artefact', text: 'What was kept here, turning slowly in its dust.' },
]
let dispose: (() => void) | null = null
onMounted(async () => {
  if (!container.value || !canvas.value || !controls.value) return
  const { mountStoryPage } = await import('~/lib/lab/labs/pages')
  dispose = await mountStoryPage({ container: container.value, canvas: canvas.value, controls: controls.value, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, onCaption: (id, on) => { active.value = { ...active.value, [id]: on } } })
  status.value = 'ready'
})
onBeforeUnmount(() => {
  dispose?.()
  dispose = null
})
</script>

<template>
  <main>
    <h1 class="sr-title">Immersive story</h1>
    <p data-status>{{ status }}</p>
    <div ref="container" class="story" style="height: 500vh" tabindex="0" role="group" aria-label="Story. Arrow keys, Page Up and Page Down move between chapters.">
      <div class="pin">
        <div ref="controls" class="stage">
          <canvas ref="canvas" class="stage-canvas" aria-hidden="true" />
        </div>
        <nav class="chapters" aria-label="Chapters">
          <button v-for="c in chapters" :key="c.id" type="button" :data-chapter="c.id">{{ c.title }}</button>
          <p data-live aria-live="polite" class="sr-title" />
        </nav>
        <ol class="captions">
          <li v-for="c in chapters" :key="c.id" :data-caption="c.id" :data-active="active[c.id] ? 'true' : 'false'">
            <h2>{{ c.title }}</h2>
            <p>{{ c.text }}</p>
          </li>
        </ol>
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
.captions { position: absolute; left: 1.5rem; bottom: 4rem; margin: 0; padding: 0; list-style: none; max-width: 24rem; color: #f2efe6; }
.captions li { opacity: 0; transition: opacity 0.4s; }
.captions li[data-active='true'] { opacity: 1; }
.captions li:not([data-active='true']) { position: absolute; }
</style>
