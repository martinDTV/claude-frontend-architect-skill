<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { listLeads } = useSales()
const { data } = await useAsyncData('home', () => listLeads())
</script>
<template>
  <section><h1>Inicio</h1><p>{{ data?.length }}</p></section>
</template>
