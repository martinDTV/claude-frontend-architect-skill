<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { listOportunidades } = useCrm()
const { data } = await useAsyncData('home', () => listOportunidades())
</script>
<template>
  <section><h1>Inicio</h1><p>{{ data?.length }}</p></section>
</template>
