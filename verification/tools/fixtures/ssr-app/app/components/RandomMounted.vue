<script setup lang="ts">
import { onMounted, ref } from 'vue'
const stamp = ref(0)
onMounted(() => {
  stamp.value = Date.now()
})
</script>
<template><time>{{ stamp }}</time></template>
