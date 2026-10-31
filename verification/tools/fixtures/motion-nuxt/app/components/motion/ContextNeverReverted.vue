<script setup lang="ts">
import gsap from 'gsap'

// a context is created but nothing ever reverts it
const root = ref<HTMLElement | null>(null)
onMounted(() => {
  gsap.context(() => {
    gsap.to('.card', { scrollTrigger: { trigger: '.card', start: 'top 90%' }, y: 0, opacity: 1 })
  }, root.value ?? undefined)
})
</script>

<template>
  <div ref="root"><article class="card">Card</article></div>
</template>
