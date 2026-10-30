<script setup lang="ts">
// Package-provided when Nuxt metadata exists (VueUse / Nuxt UI), unknown otherwise; MissingWidget never resolves.
const view = useLocalStorage('sales:view', 'table')
</script>
<template>
  <div>
    <UButton @click="view = 'cards'">Cards</UButton>
    <MissingWidget />
  </div>
</template>
