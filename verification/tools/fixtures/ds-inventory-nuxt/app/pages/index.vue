<script setup lang="ts">
import { UiButton, UiDataTable } from '~/components/ui'
const view = ref({ status: 'loading' as const })
</script>
<template><UiDataTable :view="view" caption="Shipments"><template #row="{ row }">{{ row.id }}</template></UiDataTable><UiButton>Go</UiButton></template>
