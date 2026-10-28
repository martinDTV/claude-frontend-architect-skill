<script setup lang="ts">
// Horizontal coupling: the "obra" domain uses the crm client for projects and crm types.
definePageMeta({ middleware: 'auth' })
import type { Proyecto, Contrato } from '~/types/crm'
const route = useRoute()
const { getProyecto, listContratos } = useCrm()
const proyecto = ref<Proyecto | null>(null)
const contratos = ref<Contrato[]>([])
const { catalogo } = useCatalogoWbs()
</script>
<template>
  <div><h1>{{ proyecto?.nombre }}</h1><PlanosPersonaSelect /></div>
</template>
