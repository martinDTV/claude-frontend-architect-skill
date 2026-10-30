<script setup lang="ts">
// Horizontal coupling: the "projects" domain uses the sales client for projects and sales types.
definePageMeta({ middleware: 'auth' })
import type { Project, Contrato } from '~/types/sales'
const route = useRoute()
const { getProyecto, listContratos } = useSales()
const project = ref<Project | null>(null)
const contratos = ref<Contrato[]>([])
const { catalog } = useCatalogTree()
</script>
<template>
  <div><h1>{{ project?.name }}</h1><DocumentsOwnerSelect /></div>
</template>
