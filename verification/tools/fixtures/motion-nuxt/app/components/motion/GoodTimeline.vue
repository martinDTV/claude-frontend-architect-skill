<script setup lang="ts">
import gsap from 'gsap'

// created after mount inside a context, reverted on unmount: nothing to report
const root = ref<HTMLElement | null>(null)
let ctx: gsap.Context | undefined
onMounted(() => {
  ctx = gsap.context(() => {
    gsap.timeline().from('.item', { y: 16, opacity: 0, stagger: 0.08 })
  }, root.value ?? undefined)
})
onUnmounted(() => ctx?.revert())
</script>

<template>
  <ul ref="root"><li class="item">One</li><li class="item">Two</li></ul>
</template>
