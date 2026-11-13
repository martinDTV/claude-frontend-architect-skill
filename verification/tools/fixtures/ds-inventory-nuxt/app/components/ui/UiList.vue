<!-- UiList — renders items from a fetch; only the happy path and a spinner are handled. -->
<script setup lang="ts">
defineProps<{ items: Array<{ id: string; label: string }> | null; pending: boolean }>()
</script>

<template>
  <USkeleton v-if="pending" class="h-16" />
  <ul v-else class="flex flex-col gap-[var(--space-2)]">
    <li v-for="item in items" :key="item.id">{{ item.label }}</li>
  </ul>
</template>
