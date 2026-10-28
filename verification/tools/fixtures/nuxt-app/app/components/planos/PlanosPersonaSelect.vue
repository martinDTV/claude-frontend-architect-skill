<script setup lang="ts">
// A cross-cutting component living in a domain folder (planos -> rrhh).
const { personas } = usePersonas()
const model = defineModel<string | null>()
</script>
<template>
  <select v-model="model"><option v-for="p in personas" :key="p.id" :value="p.id">{{ p.nombre }}</option></select>
</template>
