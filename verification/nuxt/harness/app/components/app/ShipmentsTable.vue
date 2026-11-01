<script setup lang="ts">
// The shipments table (data-tables.md): sortable headers that announce their state, columns from the preferences,
// row actions in a menu, stacked cards under 768px. Sorting and paging are the page's state (the URL); this
// component renders and asks.
import type { TableColumn } from '@nuxt/ui'
import { fmtDateTime, fmtInt, fmtRelative, type Shipment } from '~/lib/ui/saas/data'
import type { SortKey, TableState } from '~/lib/ui/saas/table-state'

const props = defineProps<{ rows: Shipment[]; state: TableState; columns: string[]; loading?: boolean }>()
const emit = defineEmits<{ sort: [key: SortKey]; view: [shipment: Shipment]; assign: [shipment: Shipment]; deliver: [shipment: Shipment]; cancel: [shipment: Shipment] }>()
const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const AppStatusBadge = resolveComponent('AppStatusBadge')

const labels: Record<string, string> = { reference: 'Reference', customer: 'Customer', lane: 'Lane', status: 'Status', promised: 'Promised', eta: 'ETA', weightKg: 'Weight', pallets: 'Pallets', updatedAt: 'Updated' }
const sortable = new Set<SortKey>(['reference', 'customer', 'lane', 'status', 'promised', 'eta', 'weightKg', 'pallets', 'updatedAt'])

const header = (key: string) => () => {
  if (!sortable.has(key as SortKey)) return labels[key]
  const active = props.state.sort.key === key
  const dir = active ? props.state.sort.dir : null
  return h(UButton, {
    label: labels[key],
    variant: 'ghost',
    color: 'neutral',
    size: 'sm',
    class: '-mx-2 font-medium',
    trailingIcon: dir === 'asc' ? 'i-lucide-arrow-up' : dir === 'desc' ? 'i-lucide-arrow-down' : 'i-lucide-arrow-up-down',
    'data-sort': key,
    onClick: () => emit('sort', key as SortKey),
  })
}
const cells: Record<string, (s: Shipment) => ReturnType<typeof h> | string> = {
  reference: (s) => h('span', { class: 'font-mono text-sm' }, s.reference),
  customer: (s) => s.customer,
  lane: (s) => h('span', { class: 'font-mono text-xs text-fg-muted' }, s.lane),
  status: (s) => h(AppStatusBadge, { status: s.status }),
  promised: (s) => h('span', { class: 'tabular-nums' }, fmtDateTime(s.promised)),
  eta: (s) => h('span', { class: 'tabular-nums', title: fmtDateTime(s.eta) }, `${fmtDateTime(s.eta)} · ${fmtRelative(s.eta)}`),
  weightKg: (s) => h('span', { class: 'tabular-nums' }, `${fmtInt(s.weightKg)} kg`),
  pallets: (s) => h('span', { class: 'tabular-nums' }, String(s.pallets)),
  updatedAt: (s) => h('span', { class: 'tabular-nums text-fg-muted' }, fmtRelative(s.updatedAt)),
}
// the URL's sort as TanStack sorting state, so UTable writes aria-sort on the header cell; manualSorting leaves the
// ordering to the page (the rows arrive sorted)
const sorting = computed(() => [{ id: props.state.sort.key, desc: props.state.sort.dir === 'desc' }])
const tableColumns = computed<TableColumn<Shipment>[]>(() => [
  ...props.columns.filter((c) => c in cells).map((key) => ({ accessorKey: key, enableSorting: sortable.has(key as SortKey), header: header(key), cell: ({ row }: { row: { original: Shipment } }) => cells[key]!(row.original), meta: { class: { td: ['weightKg', 'pallets'].includes(key) ? 'text-right' : '', th: ['weightKg', 'pallets'].includes(key) ? 'text-right' : '' } } })),
  {
    id: 'actions',
    header: () => h('span', { class: 'sr-only' }, 'Actions'),
    cell: ({ row }) => h(UDropdownMenu, { items: actionsFor(row.original), content: { align: 'end' } }, () => h(UButton, { icon: 'i-lucide-ellipsis', variant: 'ghost', color: 'neutral', size: 'sm', 'aria-label': `Actions for ${row.original.reference}`, 'data-row-actions': row.original.reference })),
    meta: { class: { td: 'w-10 text-right' } },
  },
])
const actionsFor = (s: Shipment) => [
  [{ label: 'View details', icon: 'i-lucide-eye', onSelect: () => emit('view', s) }],
  [
    { label: 'Assign driver', icon: 'i-lucide-user-plus', disabled: s.status === 'delivered', onSelect: () => emit('assign', s) },
    { label: 'Mark delivered', icon: 'i-lucide-check', disabled: s.status === 'delivered', onSelect: () => emit('deliver', s) },
  ],
  [{ label: 'Cancel shipment', icon: 'i-lucide-x', color: 'error' as const, disabled: s.status === 'delivered', onSelect: () => emit('cancel', s) }],
]
</script>

<template>
  <div>
    <!-- desktop and tablet: the table -->
    <UTable :data="rows" :columns="tableColumns" :sorting="sorting" :sorting-options="{ manualSorting: true }" :loading="loading" class="scroll-hint-x hidden rounded-md border border-border bg-surface md:block" :ui="{ th: 'py-1.5 text-xs uppercase tracking-wide text-fg-muted', td: 'py-1.5 [html[data-density=comfortable]_&]:py-3' }" role="region" tabindex="0" aria-label="Shipments, scrolls sideways when the columns do not fit" data-shipments-table />
    <!-- phones: the same rows as cards with the status and the identifier first -->
    <ul class="space-y-2 md:hidden" aria-label="Shipments" data-shipments-cards>
      <li v-for="s in rows" :key="s.id" class="rounded-md border border-border bg-surface p-3">
        <div class="flex items-start justify-between gap-2">
          <div><p class="font-mono text-sm font-medium">{{ s.reference }}</p><p class="text-sm">{{ s.customer }}</p></div>
          <AppStatusBadge :status="s.status" />
        </div>
        <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-fg-muted">
          <dt>Lane</dt><dd class="font-mono text-fg">{{ s.lane }}</dd>
          <dt>ETA</dt><dd class="tabular-nums text-fg">{{ fmtRelative(s.eta) }}</dd>
          <dt>Load</dt><dd class="tabular-nums text-fg">{{ fmtInt(s.weightKg) }} kg · {{ s.pallets }} pallets</dd>
        </dl>
        <div class="mt-2 flex gap-2">
          <UButton label="Details" size="xs" variant="outline" color="neutral" @click="emit('view', s)" />
          <UButton label="Assign" size="xs" variant="outline" color="neutral" :disabled="s.status === 'delivered'" @click="emit('assign', s)" />
        </div>
      </li>
    </ul>
  </div>
</template>
