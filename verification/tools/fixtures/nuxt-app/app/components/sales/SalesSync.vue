<script setup lang="ts">
import { useQuery } from '@pinia/colada'
const salesStore = useSalesStore()
const { listLeads } = useSales()
const { state } = useQuery({ key: ['sales', 'leads'], query: () => listLeads() })
// Copies the query result into a store: two sources of truth for the same server data.
watch(() => state.value.data, (data) => {
  if (data) salesStore.leads = data
})
</script>
<template><span>{{ salesStore.leads.length }}</span></template>
