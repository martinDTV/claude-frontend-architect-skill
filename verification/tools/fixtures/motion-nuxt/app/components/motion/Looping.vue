<script setup lang="ts">
import gsap from 'gsap'

// an infinite loop that is killed on unmount but never checks prefers-reduced-motion
const dot = ref<HTMLElement | null>(null)
let tween: gsap.core.Tween | undefined
onMounted(() => {
  tween = gsap.to(dot.value, { scale: 1.3, repeat: -1, yoyo: true, duration: 0.8 })
})
onUnmounted(() => tween?.kill())
</script>

<template>
  <span ref="dot" class="dot" />
</template>
