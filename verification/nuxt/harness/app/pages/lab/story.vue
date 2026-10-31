<script setup lang="ts">
// Reference experience C: immersive story. Three chapters, keyboard and buttons, hash deep links, captions in the DOM.
const container = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const controls = ref<HTMLElement | null>(null)
const status = ref('loading')
const problem = ref<string | null>(null)
const active = ref<Record<string, boolean>>({})
const chapters = [
  { id: 'arrival', title: 'Arrival', text: 'Monoliths in a field at dawn; the path leads inward.' },
  { id: 'hall', title: 'The hall', text: 'Pillars of light stand in a ring; the floor gives way.' },
  { id: 'artefact', title: 'The artefact', text: 'What was kept here, turning slowly in its dust.' },
]
let dispose: (() => void) | null = null
onMounted(async () => {
  if (!container.value || !canvas.value || !controls.value) return
  try {
    const { mountStoryPage } = await import('~/lib/lab/labs/pages')
  dispose = await mountStoryPage({ container: container.value, canvas: canvas.value, controls: controls.value, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, onCaption: (id, on) => { active.value = { ...active.value, [id]: on } } })
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
    <h1 class="sr-title">Immersive story</h1>
    <p data-status>{{ status }}</p>
    <p v-if="problem" role="alert" data-problem class="problem">{{ status === 'unsupported' ? 'This browser cannot show the 3D scene. The chapters are listed below.' : 'The scene could not be loaded: ' + problem }}</p>
    <div ref="container" :class="{ fallback: status === 'unsupported' }" class="story" style="height: 500vh" tabindex="0" role="group" aria-label="Story. Arrow keys, Page Up and Page Down move between chapters.">
      <div class="pin" data-focus-ring>
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
.story:focus-visible { outline: none; }
.story:focus-visible .pin::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 5; box-shadow: inset 0 0 0 3px #ffd27a, inset 0 0 0 10px rgba(8, 8, 12, 0.9); }
.pin { position: sticky; top: 0; height: 100vh; overflow: hidden; }
.stage { position: absolute; inset: 0; }
.stage-canvas { display: block; width: 100%; height: 100%; }
.chapters { position: absolute; top: 1rem; right: 1.5rem; display: flex; flex-wrap: wrap; justify-content: flex-end; max-width: calc(100% - 3rem); gap: 0.5rem; padding: 0.4rem 0.5rem; border-radius: 6px; background: rgba(8, 8, 12, 0.9); }
.chapters button { min-height: 32px; padding: 0 0.75rem; border-radius: 4px; border: 1px solid transparent; background: #f4f1ea; color: #1c1c22; }
.chapters button[aria-current='step'] { outline: 2px solid #ffd27a; }
.captions { position: absolute; left: 1.5rem; bottom: 4rem; margin: 0; padding: 0; list-style: none; max-width: min(24rem, calc(100% - 3rem)); color: #f2efe6; }
.captions li { opacity: 0; transition: opacity 0.4s; padding: 0.75rem 1rem; border-radius: 6px; background: rgba(8, 8, 12, 0.9); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); }
.captions li[data-active='true'] { opacity: 1; }
.captions li:not([data-active='true']) { position: absolute; }
.problem { margin: 0.5rem 1rem; color: #1c1c22; }
/* no WebGL: the chapters stand in the flow as a readable list, the canvas and the controls that drive it are gone */
.fallback { height: auto !important; }
.fallback .pin { position: static; height: auto; overflow: visible; }
.fallback .stage, .fallback .stage-canvas, .fallback .configurator, .fallback .chapters, .fallback .density { display: none; }
.fallback .captions, .fallback .caption { position: static; max-width: 36rem; margin: 1rem; color: #1c1c22; }
.fallback .captions li, .fallback .caption { opacity: 1; position: static; transition: none; margin-bottom: 0.75rem; background: #f4f1ea; text-shadow: none; }
</style>
