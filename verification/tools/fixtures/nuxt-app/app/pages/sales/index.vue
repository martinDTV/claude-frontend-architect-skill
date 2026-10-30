<script setup lang="ts">
definePageMeta({ middleware: ['auth'], layout: 'default' })
import type { Lead } from '~/types/sales'
const { listLeads } = useSales()
// From the base layer: composable and component auto-imported through layers/
const { money } = useBaseFormat()
const open = ref(false)
const rows = ref<Lead[]>([])
</script>
<template>
  <div>
    <BaseTag :label="money(1)" />
    <SalesToolbar />
    <SalesSync />
    <SalesLeadModal v-model:open="open" />
    <ul><li v-for="r in rows" :key="r.id">{{ r.name }}</li></ul>
  </div>
</template>
