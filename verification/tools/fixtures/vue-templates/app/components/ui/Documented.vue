<script setup lang="ts">
/**
 * Usage example (documentation only, nothing below is executed):
 *   <template #badge><CrmBadge status="draft" /></template>
 *   const crm = useCrm()
 *   contar(items.length, 'item', 'items')
 */
// legacy: used to render <CrmCard> here
const label = 'CrmBadge'
const hint = "call useCrm() to load"
</script>
<template>
  <!-- <CrmBadge status="commented out" /> -->
  <section :title="label">{{ hint }}</section>
</template>
