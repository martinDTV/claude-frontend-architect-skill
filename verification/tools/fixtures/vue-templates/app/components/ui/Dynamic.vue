<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import LocalWidget from './LocalWidget.vue'
const open = ref(false)
const current = shallowRef(LocalWidget)
const props = defineProps<{ mode: 'card' | 'row' }>()
</script>
<template>
  <div>
    <transition name="fade"><p v-if="open">x</p></transition>
    <keep-alive><component :is="current" /></keep-alive>
    <Teleport to="body"><slot /></Teleport>
    <component :is="props.mode === 'card' ? 'CrmBadge' : 'span'" status="literal" />
    <component is="CrmBadge" status="static" />
    <LocalWidget />
    <local-widget />
    <TotallyMissing />
  </div>
</template>
