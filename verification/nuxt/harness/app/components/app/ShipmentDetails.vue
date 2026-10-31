<script setup lang="ts">
// Shipment details in a slideover: the record read in full without leaving the table.
import { DATASET, fmtDateTime, fmtInt, fmtRelative, type Shipment } from '~/lib/ui/saas/data'
const props = defineProps<{ shipment: Shipment | null }>()
const open = defineModel<boolean>('open', { default: false })
const driver = computed(() => DATASET.drivers.find((d) => d.id === props.shipment?.driverId))
const vehicle = computed(() => DATASET.vehicles.find((v) => v.id === props.shipment?.vehicleId))
</script>

<template>
  <USlideover v-model:open="open" :title="shipment?.reference ?? 'Shipment'" :description="shipment ? `${shipment.customer} · ${shipment.origin} → ${shipment.destination}` : ''">
    <template #body>
      <dl v-if="shipment" class="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm" data-shipment-details>
        <dt class="text-fg-muted">Status</dt><dd><AppStatusBadge :status="shipment.status" /></dd>
        <dt class="text-fg-muted">Promised</dt><dd class="tabular-nums">{{ fmtDateTime(shipment.promised) }} UTC</dd>
        <dt class="text-fg-muted">ETA</dt><dd class="tabular-nums">{{ fmtDateTime(shipment.eta) }} UTC · {{ fmtRelative(shipment.eta) }}</dd>
        <dt class="text-fg-muted">Load</dt><dd class="tabular-nums">{{ fmtInt(shipment.weightKg) }} kg · {{ shipment.pallets }} pallets</dd>
        <dt class="text-fg-muted">Driver</dt><dd>{{ driver ? `${driver.name} · ${driver.phone}` : 'Unassigned' }}</dd>
        <dt class="text-fg-muted">Vehicle</dt><dd>{{ vehicle ? `${vehicle.plate} · ${vehicle.type}` : 'Unassigned' }}</dd>
        <dt class="text-fg-muted">Updated</dt><dd class="tabular-nums">{{ fmtRelative(shipment.updatedAt) }}</dd>
      </dl>
    </template>
  </USlideover>
</template>
