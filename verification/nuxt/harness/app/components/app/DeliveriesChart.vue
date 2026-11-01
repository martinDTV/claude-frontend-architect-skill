<script setup lang="ts">
// Fourteen days of deliveries as stacked bars (charts.md: one message per chart, direct labels, a table alternative
// for assistive technology). Plain SVG from the contract's colours; no chart library for two series. The bars are an
// SVG stretched to its box; the axis labels are HTML, so they follow the user's text size (text inside a scaled
// viewBox keeps the size the viewBox gives it, whatever the reader's setting).
import { fmtInt, type SeriesPoint } from '~/lib/ui/saas/data'
const props = defineProps<{ series: SeriesPoint[] }>()
const width = 560
const height = 160
const max = computed(() => Math.max(...props.series.map((p) => p.volume)) || 1)
const scaleY = (v: number) => height - (v / max.value) * height
const slot = computed(() => width / props.series.length)
const barW = computed(() => slot.value * 0.62)
const x = (i: number) => (i + 0.19) * slot.value
const ticks = computed(() => [0, 0.5, 1].map((f) => Math.round(max.value * f)))
const axis = computed(() => [...ticks.value].reverse())
const summary = computed(() => { const late = props.series.reduce((s, p) => s + p.late, 0); const total = props.series.reduce((s, p) => s + p.volume, 0); return `${fmtInt(total)} deliveries in 14 days, ${fmtInt(late)} late (${Math.round((100 * late) / Math.max(1, total))}%)` })
</script>

<template>
  <figure class="rounded-md border border-border bg-surface p-4" data-chart="deliveries">
    <figcaption class="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1"><span class="font-medium">Deliveries, last 14 days</span><span class="text-sm text-fg-muted">{{ summary }}</span></figcaption>
    <div class="grid grid-cols-[auto_1fr] gap-x-2" role="img" :aria-label="`Stacked bars of on-time and late deliveries per day. ${summary}`">
      <div class="flex h-40 flex-col justify-between text-right text-xs leading-none text-fg-muted tabular-nums" aria-hidden="true" data-axis="y">
        <span v-for="(t, i) in axis" :key="i" :class="i === 0 ? '-translate-y-1/2' : i === axis.length - 1 ? 'translate-y-1/2' : ''" data-axis-label>{{ t }}</span>
      </div>
      <svg :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" class="h-40 w-full overflow-visible" aria-hidden="true">
        <line v-for="(t, i) in ticks" :key="i" x1="0" :x2="width" :y1="scaleY(t)" :y2="scaleY(t)" stroke="var(--border)" vector-effect="non-scaling-stroke" />
        <g v-for="(p, i) in series" :key="p.day">
          <rect :x="x(i)" :y="scaleY(p.onTime + p.late)" :width="barW" :height="scaleY(0) - scaleY(p.late)" fill="var(--danger)"><title>{{ p.day }}: {{ p.late }} late</title></rect>
          <rect :x="x(i)" :y="scaleY(p.onTime)" :width="barW" :height="scaleY(0) - scaleY(p.onTime)" fill="var(--color-accent-500)"><title>{{ p.day }}: {{ p.onTime }} on time</title></rect>
        </g>
      </svg>
      <span aria-hidden="true" />
      <ol class="mt-1 grid text-xs text-fg-muted tabular-nums" :style="{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }" aria-hidden="true" data-axis="x">
        <li v-for="(p, i) in series" :key="p.day" class="text-center"><span v-if="i % 2 === 0" data-axis-label>{{ p.day.slice(5) }}</span></li>
      </ol>
    </div>
    <div class="mt-2 flex gap-4 text-xs text-fg-muted"><span><span class="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style="background: var(--color-accent-500)" aria-hidden="true" />On time</span><span><span class="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style="background: var(--danger)" aria-hidden="true" />Late</span></div>
    <details class="mt-2 text-sm">
      <summary class="cursor-pointer text-fg-muted">Data table</summary>
      <table class="mt-2 w-full text-xs tabular-nums"><caption class="sr-only">Deliveries per day</caption><thead><tr class="text-left text-fg-muted"><th scope="col" class="py-1 font-medium">Day</th><th scope="col" class="py-1 font-medium">On time</th><th scope="col" class="py-1 font-medium">Late</th></tr></thead><tbody><tr v-for="p in series" :key="p.day" class="border-t border-border"><td class="py-1">{{ p.day }}</td><td class="py-1">{{ p.onTime }}</td><td class="py-1">{{ p.late }}</td></tr></tbody></table>
    </details>
  </figure>
</template>
