<script setup lang="ts">
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// a ScrollTrigger created after mount and never killed: it survives navigation away from the page
const root = ref<HTMLElement | null>(null)
onMounted(() => {
  gsap.registerPlugin(ScrollTrigger)
  ScrollTrigger.create({ trigger: root.value, start: 'top center', pin: true, onEnter: () => root.value?.classList.add('is-active') })
})
</script>

<template>
  <section ref="root">Pinned section</section>
</template>
