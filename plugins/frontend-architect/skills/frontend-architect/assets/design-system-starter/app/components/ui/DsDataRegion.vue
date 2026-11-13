<!--
  DsDataRegion — the one way to show fetched data. The view is a DataView union, so loading, empty, error, partial and
  success are all rendered; the region is labelled and announces busy.
  @example <DsDataRegion :view="view" label="Shipments" v-slot="{ rows }"><DsTable :rows="rows" /></DsDataRegion>
-->
<script setup lang="ts" generic="Row">
import type { DataView } from './data-view'
defineProps<{ view: DataView<Row>; label: string }>()
defineSlots<{ default(props: { rows: Row[] }): unknown; empty?(): unknown }>()
</script>

<template>
  <section role="region" :aria-label="label" :aria-busy="view.status === 'loading' || undefined" class="flex flex-col gap-3">
    <USkeleton v-if="view.status === 'loading'" class="h-32 w-full" />
    <slot v-else-if="view.status === 'empty'" name="empty"><DsEmptyState :title="`No ${label.toLowerCase()} yet`" /></slot>
    <UAlert v-else-if="view.status === 'error'" color="error" variant="subtle" :title="view.message">
      <template v-if="view.retry" #actions><DsButton tone="secondary" size="sm" @click="view.retry">Retry</DsButton></template>
    </UAlert>
    <template v-else>
      <UAlert v-if="view.status === 'partial'" color="warning" variant="subtle" :title="`${view.failed} of the ${label.toLowerCase()} could not be loaded`">
        <template v-if="view.retry" #actions><DsButton tone="secondary" size="sm" @click="view.retry">Retry</DsButton></template>
      </UAlert>
      <slot :rows="view.rows" />
    </template>
  </section>
</template>
