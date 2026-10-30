<script setup lang="ts">
/**
 * Usage example (documentation only, nothing below is executed):
 *   <template #badge><SalesBadge status="draft" /></template>
 *   const sales = useSales()
 *   contar(items.length, 'item', 'items')
 */
// legacy: used to render <SalesCard> here
const label = 'SalesBadge'
const hint = "call useSales() to load"
</script>
<template>
  <!-- <SalesBadge status="commented out" /> -->
  <section :title="label">{{ hint }}</section>
</template>
