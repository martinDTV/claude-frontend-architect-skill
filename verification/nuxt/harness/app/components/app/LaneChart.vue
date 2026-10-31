<script setup lang="ts">
// Open shipments per lane as horizontal bars with direct labels (charts.md: direct labels over legends).
import { fmtInt, type LaneLoad } from '~/lib/ui/saas/data'
const props = defineProps<{ lanes: LaneLoad[] }>()
const max = computed(() => Math.max(...props.lanes.map((l) => l.shipments)) || 1)
</script>

<template>
  <figure class="rounded-md border border-border bg-surface p-4" data-chart="lanes">
    <figcaption class="mb-3 font-medium">Open shipments by lane</figcaption>
    <ol class="space-y-2" :aria-label="`Open shipments by lane, ${lanes.length} lanes`">
      <li v-for="l in lanes" :key="l.lane" class="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
        <span class="font-mono text-xs text-fg-muted">{{ l.lane }}</span>
        <span class="h-3 rounded-sm bg-border" aria-hidden="true"><span class="block h-3 rounded-sm bg-accent" :style="{ width: `${(100 * l.shipments) / max}%` }" /></span>
        <span class="tabular-nums"><span class="font-medium">{{ fmtInt(l.shipments) }}</span> <span class="text-fg-muted">· {{ fmtInt(l.weightT) }} t</span></span>
      </li>
    </ol>
  </figure>
</template>
