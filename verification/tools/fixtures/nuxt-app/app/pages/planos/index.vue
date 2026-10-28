<script setup lang="ts">
// No middleware declared: unprotected unless a global guard exists.
const { listPlanos } = usePlanos()
const planos = ref([])
</script>
<template>
  <div><PlanosPersonaSelect /><ul><li v-for="p in planos" :key="p">{{ p }}</li></ul></div>
</template>
