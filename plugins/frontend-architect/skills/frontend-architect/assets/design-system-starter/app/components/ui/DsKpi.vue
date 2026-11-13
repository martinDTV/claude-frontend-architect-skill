<!--
  DsKpi — one number with its label and, optionally, its change. Numbers use the numeric font; the change names its
  direction in text, not only in colour.
  @example <DsKpi label="On-time deliveries" value="97.2%" :delta="{ direction: 'up', text: '+1.4 pts vs last week' }" />
-->
<script setup lang="ts">
defineProps<{ label: string; value: string; delta?: { direction: 'up' | 'down' | 'flat'; text: string } }>()
</script>

<template>
  <dl class="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
    <dt class="text-sm text-[var(--fg-muted)]">{{ label }}</dt>
    <dd class="font-[family-name:var(--font-numeric)] text-2xl font-semibold text-[var(--fg)]">{{ value }}</dd>
    <dd v-if="delta" class="text-xs" :class="delta.direction === 'down' ? 'text-[var(--danger)]' : delta.direction === 'up' ? 'text-[var(--success)]' : 'text-[var(--fg-muted)]'">
      <span class="sr-only">{{ delta.direction === 'up' ? 'Up' : delta.direction === 'down' ? 'Down' : 'Unchanged' }}: </span>{{ delta.text }}
    </dd>
  </dl>
</template>
