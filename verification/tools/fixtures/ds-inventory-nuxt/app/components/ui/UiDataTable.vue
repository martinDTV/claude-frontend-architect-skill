<!--
  UiDataTable — a data region. The view is a discriminated union so every state has to be rendered:
  loading, empty, error, partial (some rows failed) and success.
-->
<script setup lang="ts" generic="Row extends { id: string }">
type View<R> =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'partial'; rows: R[]; failed: number }
  | { status: 'success'; rows: R[] }

defineProps<{ view: View<Row>; caption: string }>()
defineEmits<{ select: [row: Row] }>()
defineSlots<{ row(props: { row: Row }): unknown; empty?(): unknown }>()
</script>

<template>
  <div role="region" :aria-label="caption" :aria-busy="view.status === 'loading' || undefined">
    <USkeleton v-if="view.status === 'loading'" class="h-32" />
    <slot v-else-if="view.status === 'empty'" name="empty"><p>Nothing here yet.</p></slot>
    <UAlert v-else-if="view.status === 'error'" color="error" :title="view.message"><UiButton variant="ghost" @click="view.retry">Retry</UiButton></UAlert>
    <template v-else>
      <UAlert v-if="view.status === 'partial'" color="warning" :title="`${view.failed} rows could not be loaded`" />
      <table><caption class="sr-only">{{ caption }}</caption><tbody>
        <tr v-for="row in view.rows" :key="row.id" @click="$emit('select', row)"><slot name="row" :row="row" /></tr>
      </tbody></table>
    </template>
  </div>
</template>
