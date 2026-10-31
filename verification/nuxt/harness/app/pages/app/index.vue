<script setup lang="ts">
// The dashboard (enterprise-ui-patterns.md): what needs attention above the fold, charts with one message each,
// the exceptions table below because the exceptions are the work. Every region has its five states.
import { computeKpis, deliverySeries, fmtDateTime, fmtRelative, laneLoads, NOW, type Shipment } from '~/lib/ui/saas/data'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'app' })
useHead({ title: 'Dashboard' })
const { rows, state, error, reload } = useShipments()
const dataset = computed(() => ({ shipments: rows.value, vehicles: [] as never[], drivers: [] as never[] }))
const kpis = computed(() => computeKpis({ ...dataset.value, vehicles: rows.value.length ? DATASET_VEHICLES : [] }))
const series = deliverySeries()
const lanes = computed(() => laneLoads(dataset.value))
const exceptions = computed(() => rows.value.filter((s) => s.status === 'late' || s.status === 'at-risk').sort((a, b) => (a.status === b.status ? a.eta.localeCompare(b.eta) : a.status === 'late' ? -1 : 1)).slice(0, 8))
const columns: TableColumn<Shipment>[] = [
  { accessorKey: 'reference', header: 'Reference', cell: ({ row }) => h('span', { class: 'font-mono text-sm' }, row.original.reference) },
  { accessorKey: 'customer', header: 'Customer' },
  { accessorKey: 'lane', header: 'Lane', cell: ({ row }) => h('span', { class: 'font-mono text-xs text-fg-muted' }, row.original.lane) },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => h(resolveComponent('AppStatusBadge'), { status: row.original.status }) },
  { accessorKey: 'eta', header: 'ETA', cell: ({ row }) => h('span', { class: 'tabular-nums' }, `${fmtDateTime(row.original.eta)} · ${fmtRelative(row.original.eta)}`) },
]
import { DATASET } from '~/lib/ui/saas/data'
const DATASET_VEHICLES = DATASET.vehicles
</script>

<template>
  <UDashboardPanel id="dashboard">
    <template #header>
      <UDashboardNavbar title="Dashboard">
        <template #right><span class="text-xs text-fg-muted tabular-nums">Updated {{ fmtDateTime(NOW) }} UTC</span></template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <main id="main" class="space-y-6" tabindex="-1">
        <h1 class="sr-only">Dashboard</h1>
        <AppStateBlock :state="state" region="kpis" title="Today's numbers" :rows="2" empty-title="No shipments yet" empty-text="The dashboard fills in as soon as the first shipment is planned. Create one to see late, at-risk and unassigned loads here." :empty-action="{ label: 'Plan the first shipment', to: '/app/shipments/new' }" :error="error" @retry="reload">
          <section aria-labelledby="kpis">
            <h2 id="kpis" class="sr-only">Key numbers</h2>
            <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5" data-kpis>
              <li v-for="k in kpis" :key="k.id"><AppKpiTile :kpi="k" /></li>
            </ul>
          </section>
          <section aria-labelledby="charts" class="mt-6 grid gap-4 lg:grid-cols-5">
            <h2 id="charts" class="sr-only">Trends</h2>
            <div class="lg:col-span-3"><AppDeliveriesChart :series="series" /></div>
            <div class="lg:col-span-2"><AppLaneChart :lanes="lanes" /></div>
          </section>
          <section aria-labelledby="exceptions" class="mt-6">
            <div class="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="exceptions" class="text-lg font-semibold">Exceptions · late and at risk</h2>
              <UButton to="/app/shipments?status=late,at-risk" variant="link" color="primary" label="View all" trailing-icon="i-lucide-arrow-right" />
            </div>
            <UTable :data="exceptions" :columns="columns" class="rounded-md border border-border bg-surface" :ui="{ th: 'py-2', td: 'py-2' }" role="region" tabindex="0" aria-label="Late and at-risk shipments, scrolls sideways on narrow screens" data-exceptions />
          </section>
        </AppStateBlock>
      </main>
    </template>
  </UDashboardPanel>
</template>
