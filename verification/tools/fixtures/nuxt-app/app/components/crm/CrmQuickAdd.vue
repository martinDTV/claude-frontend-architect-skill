<script setup lang="ts">
// Fetches, but the only store write is a literal flag: not a server-data copy.
const uiStore = useUiStore()
const { apiFetch } = useApi()
async function guardar() {
  uiStore.loading = true
  await apiFetch('/crm/leads')
  uiStore.loading = false
}
</script>
<template><button @click="guardar">Guardar</button></template>
