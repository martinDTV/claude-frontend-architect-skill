<script setup lang="ts">
definePageMeta({ middleware: ['auth'], layout: 'default' })
import type { Oportunidad } from '~/types/crm'
const { listOportunidades } = useCrm()
// From the base layer: composable and component auto-imported through layers/
const { money } = useBaseFormat()
const open = ref(false)
const rows = ref<Oportunidad[]>([])
</script>
<template>
  <div>
    <BaseTag :label="money(1)" />
    <CrmToolbar />
    <CrmSync />
    <CrmOportunidadModal v-model:open="open" />
    <ul><li v-for="r in rows" :key="r.id">{{ r.nombre }}</li></ul>
  </div>
</template>
