<!--
  DsEmptyState — what an empty region says: a title, one line of help and, when there is one, the action that fills it.
  @example <DsEmptyState title="No shipments yet" help="Create the first one to see it here."><DsButton @click="create">New shipment</DsButton></DsEmptyState>
-->
<script setup lang="ts">
defineProps<{ title: string; help?: string }>()
</script>

<template>
  <div class="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-8 text-center">
    <p class="font-medium text-[var(--fg)]">{{ title }}</p>
    <p v-if="help" class="text-sm text-[var(--fg-muted)]">{{ help }}</p>
    <div v-if="$slots.default" class="mt-2"><slot /></div>
  </div>
</template>
