<script setup lang="ts">
definePageMeta({ layout: 'secure' })
const route = useRoute()
const { data: order } = await useFetch(`/api/orders/${route.params.id}`)
</script>
<template><article><h1>Order {{ order?.id }}</h1><p>{{ order?.total }}</p></article></template>
