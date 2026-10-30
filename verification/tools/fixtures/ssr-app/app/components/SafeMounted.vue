<script setup lang="ts">
import { onMounted, ref } from 'vue'
const width = ref(0)
onMounted(() => {
  width.value = window.innerWidth
  document.title = 'ready'
})
</script>
<template><p>{{ width }}</p></template>
