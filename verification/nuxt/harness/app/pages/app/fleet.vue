<script setup lang="ts">
// Fleet: vehicles with their plan status, a compact list that reads on a phone (cards) and on a desktop (grid).
import { DATASET, fmtRelative, type VehicleStatus } from '~/lib/ui/saas/data'

definePageMeta({ layout: 'app' })
useHead({ title: 'Fleet' })
const filter = ref<'all' | VehicleStatus>('all')
const options = [{ label: 'All vehicles', value: 'all' }, { label: 'On plan', value: 'on-plan' }, { label: 'Off plan', value: 'off-plan' }, { label: 'In maintenance', value: 'maintenance' }]
const vehicles = computed(() => DATASET.vehicles.filter((v) => filter.value === 'all' || v.status === filter.value))
const tone: Record<VehicleStatus, { color: 'success' | 'warning' | 'neutral'; label: string; glyph: string }> = { 'on-plan': { color: 'success', label: 'On plan', glyph: '●' }, 'off-plan': { color: 'warning', label: 'Off plan', glyph: '▲' }, maintenance: { color: 'neutral', label: 'Maintenance', glyph: '○' } }
</script>

<template>
  <UDashboardPanel id="fleet">
    <template #header>
      <UDashboardNavbar title="Fleet">
        <template #right>
          <USelect v-model="filter" :items="options" value-key="value" aria-label="Filter vehicles by status" class="w-44" data-fleet-filter />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <main id="main" tabindex="-1">
        <h1 class="sr-only">Fleet</h1>
        <p class="mb-3 text-sm text-fg-muted" aria-live="polite">{{ vehicles.length }} of {{ DATASET.vehicles.length }} vehicles</p>
        <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-vehicles>
          <li v-for="v in vehicles" :key="v.id" class="rounded-md border border-border bg-surface p-3">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="font-mono font-medium">{{ v.plate }}</p>
                <p class="text-sm text-fg-muted capitalize">{{ v.type }} · {{ v.id }}</p>
              </div>
              <UBadge :color="tone[v.status].color" variant="subtle" size="sm"><span aria-hidden="true" class="mr-1">{{ tone[v.status].glyph }}</span>{{ tone[v.status].label }}</UBadge>
            </div>
            <p class="mt-2 text-xs text-fg-muted tabular-nums">Last seen {{ fmtRelative(v.lastSeen) }}</p>
          </li>
        </ul>
      </main>
    </template>
  </UDashboardPanel>
</template>
