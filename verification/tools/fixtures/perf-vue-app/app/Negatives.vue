<script setup lang="ts">
import { computed, reactive, watch, defineAsyncComponent } from 'vue'
const Heavy = defineAsyncComponent(() => import('three'))
const state = reactive({ a: 1, b: { c: 2 } })
// pure computed that builds and mutates a LOCAL object -> NOT flagged
const derived = computed(() => { const s: Record<string, number> = {}; s.a = state.a * 2; return s })
// watch a specific getter -> NOT flagged
watch(() => state.a, () => { /* react to one field */ })
</script>
<template><component :is="Heavy" :data-d="derived.a" /></template>
