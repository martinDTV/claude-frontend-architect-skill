<script setup lang="ts">
import { gsap } from 'gsap'
const open = defineModel<boolean>('open')
const { listLeads } = useSales()
const root = ref<HTMLElement | null>(null)
// Leaks: listener and interval are never removed; GSAP tween without context/revert.
onMounted(() => {
  window.addEventListener('keydown', onKey)
  setInterval(() => listLeads(), 5000)
  gsap.from(root.value, { y: 20, autoAlpha: 0 })
})
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
</script>
<template>
  <div ref="root" v-if="open"><slot /></div>
</template>
