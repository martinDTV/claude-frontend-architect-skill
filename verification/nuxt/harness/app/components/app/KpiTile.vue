<script setup lang="ts">
// A number with its context (enterprise-ui-patterns.md: value in tabular figures, quieter label, delta with sign and
// a word, never colour alone), the whole tile a link to the breakdown.
import type { Kpi } from '~/lib/ui/saas/data'
import { fmtInt } from '~/lib/ui/saas/data'
const props = defineProps<{ kpi: Kpi }>()
const tone = computed(() => ({ danger: 'text-danger', warning: 'text-warning', info: 'text-info', success: 'text-success', neutral: 'text-fg' } as const)[props.kpi.tone])
const deltaWord = computed(() => (props.kpi.delta > 0 ? 'up' : props.kpi.delta < 0 ? 'down' : 'flat'))
</script>

<template>
  <NuxtLink :to="kpi.href" class="group block rounded-md border border-border bg-surface p-4 transition-colors hover:border-border-strong focus-visible:outline-2" :data-kpi="kpi.id">
    <p class="text-sm text-fg-muted">{{ kpi.label }}</p>
    <p class="mt-1 flex items-baseline gap-1">
      <span class="text-2xl font-semibold tabular-nums tracking-tight" :class="tone" data-kpi-value>{{ fmtInt(kpi.value) }}</span>
      <span v-if="kpi.unit" class="text-sm text-fg-muted">{{ kpi.unit }}</span>
    </p>
    <p class="mt-1 text-xs text-fg-muted tabular-nums">
      <span class="font-medium" :class="kpi.delta === 0 ? '' : kpi.delta > 0 && kpi.tone === 'danger' ? 'text-danger' : kpi.delta < 0 && kpi.tone === 'danger' ? 'text-success' : ''">{{ deltaWord }} {{ kpi.delta === 0 ? '' : Math.abs(kpi.delta) }}</span>
      {{ kpi.deltaLabel }}
    </p>
  </NuxtLink>
</template>
