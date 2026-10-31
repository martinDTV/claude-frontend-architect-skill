<script setup lang="ts">
// Fourteen days of deliveries as stacked bars (charts.md: one message per chart, direct labels, a table alternative
// for assistive technology). Plain SVG from the contract's colours; no chart library for two series.
import { fmtInt, type SeriesPoint } from '~/lib/ui/saas/data'
const props = defineProps<{ series: SeriesPoint[] }>()
const width = 560
const height = 180
const pad = { top: 12, right: 8, bottom: 28, left: 36 }
const max = computed(() => Math.max(...props.series.map((p) => p.volume)) || 1)
const scaleY = (v: number) => (height - pad.bottom) - ((v / max.value) * (height - pad.top - pad.bottom))
const barW = computed(() => ((width - pad.left - pad.right) / props.series.length) * 0.62)
const x = (i: number) => pad.left + (i + 0.19) * ((width - pad.left - pad.right) / props.series.length)
const ticks = computed(() => [0, 0.5, 1].map((f) => Math.round(max.value * f)))
const summary = computed(() => { const late = props.series.reduce((s, p) => s + p.late, 0); const total = props.series.reduce((s, p) => s + p.volume, 0); return `${fmtInt(total)} deliveries in 14 days, ${fmtInt(late)} late (${Math.round((100 * late) / Math.max(1, total))}%)` })
</script>

<template>
  <figure class="rounded-md border border-border bg-surface p-4" data-chart="deliveries">
    <figcaption class="mb-2 flex items-baseline justify-between gap-2"><span class="font-medium">Deliveries, last 14 days</span><span class="text-sm text-fg-muted">{{ summary }}</span></figcaption>
    <svg :viewBox="`0 0 ${width} ${height}`" class="h-auto w-full" role="img" :aria-label="`Stacked bars of on-time and late deliveries per day. ${summary}`">
      <g v-for="t in ticks" :key="t" class="text-fg-muted">
        <line :x1="pad.left" :x2="width - pad.right" :y1="scaleY(t)" :y2="scaleY(t)" stroke="var(--border)" stroke-width="1" />
        <text :x="pad.left - 6" :y="scaleY(t) + 4" text-anchor="end" font-size="11" fill="currentColor" class="tabular-nums">{{ t }}</text>
      </g>
      <g v-for="(p, i) in series" :key="p.day">
        <rect :x="x(i)" :y="scaleY(p.onTime + p.late)" :width="barW" :height="scaleY(0) - scaleY(p.late)" fill="var(--danger)"><title>{{ p.day }}: {{ p.late }} late</title></rect>
        <rect :x="x(i)" :y="scaleY(p.onTime)" :width="barW" :height="scaleY(0) - scaleY(p.onTime)" fill="var(--color-accent-500)"><title>{{ p.day }}: {{ p.onTime }} on time</title></rect>
        <text v-if="i % 2 === 0" :x="x(i) + barW / 2" :y="height - 8" text-anchor="middle" font-size="11" fill="var(--fg-muted)">{{ p.day.slice(5) }}</text>
      </g>
    </svg>
    <div class="mt-2 flex gap-4 text-xs text-fg-muted"><span><span class="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style="background: var(--color-accent-500)" aria-hidden="true" />On time</span><span><span class="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style="background: var(--danger)" aria-hidden="true" />Late</span></div>
    <details class="mt-2 text-sm">
      <summary class="cursor-pointer text-fg-muted">Data table</summary>
      <table class="mt-2 w-full text-xs tabular-nums"><caption class="sr-only">Deliveries per day</caption><thead><tr class="text-left text-fg-muted"><th scope="col" class="py-1 font-medium">Day</th><th scope="col" class="py-1 font-medium">On time</th><th scope="col" class="py-1 font-medium">Late</th></tr></thead><tbody><tr v-for="p in series" :key="p.day" class="border-t border-border"><td class="py-1">{{ p.day }}</td><td class="py-1">{{ p.onTime }}</td><td class="py-1">{{ p.late }}</td></tr></tbody></table>
    </details>
  </figure>
</template>
