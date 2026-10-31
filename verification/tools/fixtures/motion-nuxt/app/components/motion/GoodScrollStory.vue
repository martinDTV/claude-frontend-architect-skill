<script setup lang="ts">
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// matchMedia with a reduced-motion branch; ScrollTriggers live inside the handler; mm.revert() on unmount
const root = ref<HTMLElement | null>(null)
let mm: gsap.MatchMedia | undefined
onMounted(() => {
  gsap.registerPlugin(ScrollTrigger)
  mm = gsap.matchMedia(root.value ?? undefined)
  mm.add({ reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' }, (context) => {
    const { reduce } = context.conditions as { reduce: boolean }
    if (reduce) {
      gsap.set('.panel', { opacity: 1, y: 0 })
      return
    }
    gsap.timeline({ scrollTrigger: { trigger: root.value, start: 'top 80%', end: 'bottom top', scrub: 1 } }).from('.panel', { y: 40, opacity: 0, stagger: 0.2 })
  })
})
onUnmounted(() => mm?.revert())
</script>

<template>
  <section ref="root"><div class="panel">A</div><div class="panel">B</div></section>
</template>
