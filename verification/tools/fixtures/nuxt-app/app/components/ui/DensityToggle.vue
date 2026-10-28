<script setup lang="ts">
// Client-owned preference: a store write without any fetch is not a server-data copy.
const uiStore = useUiStore()
function compact() {
  uiStore.sidebar = false
  uiStore.toggle()
}
</script>
<template><button @click="compact">Compacto</button></template>
