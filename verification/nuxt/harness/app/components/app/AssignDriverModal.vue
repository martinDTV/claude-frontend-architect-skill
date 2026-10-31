<script setup lang="ts">
// Assign a driver: a dialog with one combobox-style select, validation, a pending state, server errors mapped to the
// field (?api=fail makes the api refuse), focus trapped and restored by the modal.
import { DATASET, type Shipment } from '~/lib/ui/saas/data'
import type { ApiError, ApiMode } from '~/lib/ui/saas/forms'

const props = defineProps<{ shipment: Shipment | null; mode: ApiMode }>()
const emit = defineEmits<{ assigned: [shipmentId: string, driverId: string] }>()
const open = defineModel<boolean>('open', { default: false })
const toast = useToast()
const driverId = ref<string | undefined>(undefined)
const error = ref<string | null>(null)
const busy = ref(false)
const drivers = DATASET.drivers.filter((d) => d.onDuty).map((d) => ({ label: `${d.name} · ${d.phone}`, value: d.id }))
watch(open, (o) => { if (o) { driverId.value = props.shipment?.driverId ?? undefined; error.value = null } })
async function submit() {
  if (!driverId.value) { error.value = 'Choose a driver who is on duty.'; return }
  busy.value = true
  error.value = null
  try {
    await shipmentsApi.assign(props.shipment!.id, driverId.value, { mode: props.mode === 'fail' ? 'fail' : 'ok' })
    emit('assigned', props.shipment!.id, driverId.value)
    toast.add({ title: `Driver assigned to ${props.shipment!.reference}`, color: 'success', icon: 'i-lucide-check' })
    open.value = false
  } catch (e) {
    error.value = (e as ApiError).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="shipment ? `Assign a driver to ${shipment.reference}` : 'Assign a driver'" :description="shipment ? `${shipment.customer} · ${shipment.lane}` : ''" :ui="{ footer: 'justify-end' }">
    <template #body>
      <form id="assign-form" class="space-y-4" novalidate @submit.prevent="submit">
        <UFormField label="Driver" name="driverId" required :error="error ?? undefined" help="Only drivers on duty are listed.">
          <USelectMenu v-model="driverId" :items="drivers" value-key="value" placeholder="Search by name" searchable class="w-full" data-assign-driver />
        </UFormField>
      </form>
    </template>
    <template #footer="{ close }">
      <UButton label="Cancel" color="neutral" variant="ghost" :disabled="busy" @click="close" />
      <UButton type="submit" form="assign-form" label="Assign" color="primary" :loading="busy" :disabled="busy" data-assign-submit />
    </template>
  </UModal>
</template>
