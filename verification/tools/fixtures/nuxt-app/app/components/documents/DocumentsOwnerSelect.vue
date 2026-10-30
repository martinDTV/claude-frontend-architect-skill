<script setup lang="ts">
// A cross-cutting component living in a domain folder (documents -> people).
const { people } = usePeople()
const model = defineModel<string | null>()
</script>
<template>
  <select v-model="model"><option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option></select>
</template>
