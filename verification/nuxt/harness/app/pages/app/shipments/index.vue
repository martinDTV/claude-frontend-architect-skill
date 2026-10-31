<script setup lang="ts">
// Shipments: the URL is the table state (sort, filters, search, page); the toolbar edits it, the table renders it,
// the row actions open a slideover, a dialog, or confirm with an undo toast; a destructive action names its
// consequence before it runs. Five states through the shared data region.
import { STATUS_LABEL, type Shipment, type ShipmentStatus } from '~/lib/ui/saas/data'
import { ACTIVE_FILTERS, DEFAULT_TABLE_STATE, PAGE_SIZES, applyTableState, queryToState, stateToQuery, toggleSort, type SortKey, type TableState } from '~/lib/ui/saas/table-state'

definePageMeta({ layout: 'app' })
useHead({ title: 'Shipments' })
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { rows, state: region, error, mode, reload } = useShipments()
const { prefs } = usePreferences()
const tableState = computed<TableState>(() => { const s = queryToState(route.query as Record<string, string>); if (!('size' in route.query) && prefs.value.pageSize !== DEFAULT_TABLE_STATE.pageSize) s.pageSize = prefs.value.pageSize; return s })
const setState = (next: TableState) => router.replace({ query: { ...(route.query.api ? { api: route.query.api } : {}), ...stateToQuery(next) } })
const result = computed(() => applyTableState(localRows.value, tableState.value))
// local edits (delivered, cancelled) on top of the loaded rows: optimistic, reversible
const overrides = ref<Record<string, Partial<Shipment> | null>>({})
const localRows = computed(() => rows.value.flatMap((s) => (overrides.value[s.id] === null ? [] : [{ ...s, ...(overrides.value[s.id] ?? {}) }])))

const search = ref(tableState.value.search)
watch(() => tableState.value.search, (v) => { search.value = v })
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, (v) => { if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(() => { if (v !== tableState.value.search) setState({ ...tableState.value, search: v, page: 1 }) }, 250) })
const statusItems = (Object.keys(STATUS_LABEL) as ShipmentStatus[]).map((s) => ({ label: STATUS_LABEL[s], value: s }))
const statuses = computed({ get: () => tableState.value.status, set: (v: ShipmentStatus[]) => setState({ ...tableState.value, status: v, page: 1 }) })
const lanes = computed(() => [{ label: 'All lanes', value: null }, ...[...new Set(rows.value.map((s) => s.lane))].sort().map((l) => ({ label: l, value: l }))])
const lane = computed({ get: () => tableState.value.lane, set: (v: string | null) => setState({ ...tableState.value, lane: v, page: 1 }) })
const assignedItems = [{ label: 'Assigned or not', value: 'any' }, { label: 'Assigned', value: 'yes' }, { label: 'Unassigned', value: 'no' }]
const assigned = computed({ get: () => tableState.value.assigned, set: (v: TableState['assigned']) => setState({ ...tableState.value, assigned: v, page: 1 }) })
const pageSize = computed({ get: () => tableState.value.pageSize, set: (v: number) => setState({ ...tableState.value, pageSize: v, page: 1 }) })
const page = computed({ get: () => result.value.page, set: (v: number) => setState({ ...tableState.value, page: v }) })
const sizeItems = PAGE_SIZES.map((n) => ({ label: `${n} per page`, value: n as number }))
const activeFilters = computed(() => ACTIVE_FILTERS(tableState.value))
const clearFilters = () => setState({ ...DEFAULT_TABLE_STATE, sort: tableState.value.sort, pageSize: tableState.value.pageSize })
const onSort = (key: SortKey) => setState(toggleSort(tableState.value, key))

const selected = ref<Shipment | null>(null)
const detailsOpen = ref(false)
const assignOpen = ref(false)
const cancelOpen = ref(false)
const view = (s: Shipment) => { selected.value = s; detailsOpen.value = true }
const assign = (s: Shipment) => { selected.value = s; assignOpen.value = true }
const onAssigned = (id: string, driverId: string) => { overrides.value = { ...overrides.value, [id]: { ...(overrides.value[id] ?? {}), driverId } } }
function deliver(s: Shipment) {
  const previous = overrides.value[s.id]
  overrides.value = { ...overrides.value, [s.id]: { ...(previous ?? {}), status: 'delivered' } }
  toast.add({ title: `${s.reference} marked delivered`, description: 'Undo within a few seconds if that was not the one.', color: 'success', icon: 'i-lucide-check', actions: [{ label: 'Undo', color: 'neutral', variant: 'outline', onClick: () => { overrides.value = { ...overrides.value, [s.id]: previous ?? {} } } }] })
}
const askCancel = (s: Shipment) => { selected.value = s; cancelOpen.value = true }
function confirmCancel() {
  if (!selected.value) return
  overrides.value = { ...overrides.value, [selected.value.id]: null }
  toast.add({ title: `${selected.value.reference} cancelled`, description: 'The customer and the driver are notified.', color: 'neutral', icon: 'i-lucide-x' })
  cancelOpen.value = false
}
const createdRef = computed(() => String(route.query.created ?? ''))
</script>

<template>
  <UDashboardPanel id="shipments">
    <template #header>
      <UDashboardNavbar title="Shipments">
        <template #right><UButton to="/app/shipments/new" icon="i-lucide-plus" label="New shipment" color="primary" /></template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <div class="flex w-full flex-wrap items-center gap-2" data-toolbar>
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search reference, customer, lane" aria-label="Search shipments" class="w-full sm:w-64" data-search />
          <!-- each filter is named by its label and its own value, so the visible text is part of the accessible name -->
          <span id="filter-status-label" class="sr-only">Status</span>
          <USelectMenu id="filter-status" v-model="statuses" :items="statusItems" value-key="value" multiple placeholder="Status" class="w-full sm:w-44" aria-labelledby="filter-status-label filter-status" data-filter-status />
          <span id="filter-lane-label" class="sr-only">Lane</span>
          <USelectMenu id="filter-lane" v-model="lane" :items="lanes" value-key="value" placeholder="Lane" class="w-full sm:w-40" aria-labelledby="filter-lane-label filter-lane" data-filter-lane />
          <span id="filter-assigned-label" class="sr-only">Assignment</span>
          <USelect id="filter-assigned" v-model="assigned" :items="assignedItems" value-key="value" class="w-full sm:w-40" aria-labelledby="filter-assigned-label filter-assigned" data-filter-assigned />
          <UButton v-if="activeFilters.length" label="Clear filters" variant="ghost" color="neutral" icon="i-lucide-x" data-clear-filters @click="clearFilters" />
        </div>
      </UDashboardToolbar>
    </template>
    <template #body>
      <main id="main" class="space-y-3" tabindex="-1">
        <h1 class="sr-only">Shipments</h1>
        <UAlert v-if="createdRef" color="success" variant="subtle" icon="i-lucide-check" :title="`${createdRef} is planned`" description="It is at the top of the list, filtered by its reference. Clear the search to see everything." data-created />
        <AppStateBlock :state="region" region="shipments" title="Shipments" :rows="8" empty-title="No shipments" empty-text="Nothing is planned yet. The first shipment you create appears here with its status, lane and times." :empty-action="{ label: 'New shipment', to: '/app/shipments/new' }" :error="error" @retry="reload">
          <p class="text-sm text-fg-muted tabular-nums" aria-live="polite" data-result-count>
            <template v-if="result.total">Showing {{ result.from }}–{{ result.to }} of {{ result.total }}<template v-if="activeFilters.length"> · {{ activeFilters.length }} filter{{ activeFilters.length === 1 ? '' : 's' }}</template></template>
            <template v-else>No shipments match these filters.</template>
          </p>
          <UEmpty v-if="result.total === 0" icon="i-lucide-filter-x" title="No match" description="Widen the filters or clear the search." :actions="[{ label: 'Clear filters', onClick: clearFilters }]" data-no-match />
          <AppShipmentsTable v-else :rows="result.rows" :state="tableState" :columns="prefs.columns" @sort="onSort" @view="view" @assign="assign" @deliver="deliver" @cancel="askCancel" />
          <nav v-if="result.total > 0" class="flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
            <USelect v-model="pageSize" :items="sizeItems" value-key="value" class="w-40" aria-label="Rows per page" data-page-size />
            <UPagination v-model:page="page" :total="result.total" :items-per-page="tableState.pageSize" :sibling-count="1" show-edges data-pagination />
          </nav>
        </AppStateBlock>
        <AppShipmentDetails v-model:open="detailsOpen" :shipment="selected" />
        <AppAssignDriverModal v-model:open="assignOpen" :shipment="selected" :mode="mode" @assigned="onAssigned" />
        <UModal v-model:open="cancelOpen" title="Cancel this shipment?" :description="selected ? `${selected.reference} for ${selected.customer} will be removed from the plan and the customer and driver will be notified. This cannot be undone.` : ''" :ui="{ footer: 'justify-end' }">
          <template #footer="{ close }">
            <UButton label="Keep it" color="neutral" variant="ghost" @click="close" />
            <UButton label="Cancel shipment" color="error" data-confirm-cancel @click="confirmCancel" />
          </template>
        </UModal>
      </main>
    </template>
  </UDashboardPanel>
</template>
