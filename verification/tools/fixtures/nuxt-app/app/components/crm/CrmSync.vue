<script setup lang="ts">
import { useQuery } from '@pinia/colada'
const crmStore = useCrmStore()
const { listOportunidades } = useCrm()
const { state } = useQuery({ key: ['crm', 'oportunidades'], query: () => listOportunidades() })
// Copies the query result into a store: two sources of truth for the same server data.
watch(() => state.value.data, (data) => {
  if (data) crmStore.oportunidades = data
})
</script>
<template><span>{{ crmStore.oportunidades.length }}</span></template>
