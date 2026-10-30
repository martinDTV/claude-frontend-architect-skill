<script setup lang="ts">
// No middleware declared: unprotected unless a global guard exists.
const { listDocuments } = useDocuments()
const documents = ref([])
</script>
<template>
  <div><DocumentsOwnerSelect /><ul><li v-for="p in documents" :key="p">{{ p }}</li></ul></div>
</template>
