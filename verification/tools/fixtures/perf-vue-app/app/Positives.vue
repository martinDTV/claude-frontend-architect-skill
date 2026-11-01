<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import * as THREE from 'three'
const props = defineProps<{ id: string }>()
const emit = defineEmits<{ touched: [] }>()
const state = reactive({ a: 1, b: { c: 2 } })
// computed-side-effect (heuristic): emits from a getter
const bad = computed(() => { emit('touched'); return state.a + 1 })
// reactive-deep-watch (heuristic): watches the whole reactive object
watch(state, () => { /* react */ })
// reactive-deep-watch (heuristic): watches the whole props object
watch(props, () => { /* react */ })
const scene = new THREE.Scene()
</script>
<template><div :data-bad="bad" :data-s="scene.uuid" /></template>
