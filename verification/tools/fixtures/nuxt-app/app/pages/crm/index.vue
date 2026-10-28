<script setup lang="ts">
definePageMeta({ middleware: ['auth'], layout: 'default' })
import type { Oportunidad } from '~/types/crm'
const { listOportunidades } = useCrm()
const open = ref(false)
const rows = ref<Oportunidad[]>([])
</script>
<template>
  <div>
    <CrmOportunidadModal v-model:open="open" />
    <ul><li v-for="r in rows" :key="r.id">{{ r.nombre }}</li></ul>
  </div>
</template>
