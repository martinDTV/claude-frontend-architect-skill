<script setup lang="ts">
// The new-shipment form (forms.md): the shared Zod schema drives validation, labels always visible, helper text
// before errors, validation on blur and submit, an error summary that moves focus, a pending state on the submit, a
// server error (?api=fail: duplicate reference) mapped to its field. The promised slot is a native date input and a
// native time input (the platform's pickers, keyboard-operable; the harness holds two copies of the date library the
// Nuxt UI date field models, so its typed model is left to the Next app's calendar), composed into the ISO value.
import type { FormSubmitEvent } from '@nuxt/ui'
import { DATASET, HUBS } from '~/lib/ui/saas/data'
import { shipmentFormSchema, type ApiError, type ApiMode, type ShipmentFormValues } from '~/lib/ui/saas/forms'

const props = defineProps<{ mode: ApiMode }>()
const emit = defineEmits<{ created: [reference: string] }>()
type Hub = (typeof HUBS)[number]
const state = reactive<{ reference: string; customer: string; origin: Hub; destination: Hub; promised: string; weightKg: string; pallets: string; driverId: string | null; notes: string; priority: boolean }>({ reference: '', customer: '', origin: 'Bilbao', destination: 'Madrid', promised: '', weightKg: '', pallets: '', driverId: null, notes: '', priority: false })
const date = ref('')
const time = ref('09:00')
watch([date, time], ([d, t]) => { state.promised = d ? `${d}T${t || '09:00'}` : '' })
const form = ref()
const busy = ref(false)
const serverError = ref<string | null>(null)
const summary = ref<HTMLElement | null>(null)
const errors = ref<{ name: string; message: string }[]>([])
const hubItems = HUBS.map((h) => ({ label: h, value: h }))
const driverItems = [{ label: 'Unassigned for now', value: null }, ...DATASET.drivers.filter((d) => d.onDuty).map((d) => ({ label: d.name, value: d.id }))]
const toast = useToast()
const minDate = '2026-10-31'

async function onSubmit(event: FormSubmitEvent<ShipmentFormValues>) {
  busy.value = true
  serverError.value = null
  try {
    const created = await shipmentsApi.create(event.data, { mode: props.mode === 'fail' ? 'fail' : 'ok' })
    toast.add({ title: `Shipment ${created.reference} planned`, description: `${created.lane}, promised ${created.promised.slice(0, 16).replace('T', ' ')} UTC.`, color: 'success', icon: 'i-lucide-check' })
    emit('created', created.reference)
  } catch (e) {
    const err = e as ApiError
    serverError.value = err.message
    // a conflict names the field: the reference already exists
    if (err.status === 409) form.value?.setErrors([{ name: 'reference', message: err.message }])
    await nextTick()
    summary.value?.focus()
  } finally {
    busy.value = false
  }
}
async function onError(event: { errors: { name?: string; message: string }[] }) {
  errors.value = event.errors.filter((e): e is { name: string; message: string } => Boolean(e.name))
  await nextTick()
  summary.value?.focus()
}
</script>

<template>
  <UForm ref="form" :schema="shipmentFormSchema" :state="state" :validate-on="['blur', 'change']" class="max-w-2xl space-y-6" data-shipment-form @submit="onSubmit" @error="onError">
    <div v-if="errors.length || serverError" ref="summary" tabindex="-1" role="alert" class="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm" data-error-summary>
      <p class="font-medium text-danger">{{ serverError ? 'The shipment was not saved.' : `Check ${errors.length} field${errors.length === 1 ? '' : 's'} before saving.` }}</p>
      <p v-if="serverError" class="mt-1">{{ serverError }}</p>
      <ul v-else class="mt-1 list-disc pl-5"><li v-for="e in errors" :key="e.name"><a :href="`#field-${e.name}`" class="underline">{{ e.message }}</a></li></ul>
    </div>
    <fieldset class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <legend class="mb-2 text-sm font-semibold">Order</legend>
      <UFormField label="Reference" name="reference" required help="ATL followed by five digits, e.g. ATL-26501.">
        <UInput id="field-reference" v-model="state.reference" placeholder="ATL-26501" class="w-full font-mono" autocomplete="off" />
      </UFormField>
      <UFormField label="Customer" name="customer" required>
        <UInput id="field-customer" v-model="state.customer" class="w-full" autocomplete="organization" />
      </UFormField>
    </fieldset>
    <fieldset class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <legend class="mb-2 text-sm font-semibold">Route</legend>
      <UFormField label="Origin hub" name="origin" required>
        <USelect id="field-origin" v-model="state.origin" :items="hubItems" value-key="value" class="w-full" />
      </UFormField>
      <UFormField label="Destination hub" name="destination" required help="Must differ from the origin.">
        <USelect id="field-destination" v-model="state.destination" :items="hubItems" value-key="value" class="w-full" />
      </UFormField>
      <UFormField label="Promised date" name="promised" required help="The slot the customer was given, UTC.">
        <div class="flex flex-wrap gap-2">
          <UInput id="field-promised" v-model="date" type="date" :min="minDate" class="w-44 max-w-full" aria-label="Promised date" />
          <UInput id="field-promised-time" v-model="time" type="time" name="promisedTime" class="w-32" aria-label="Promised time" />
        </div>
      </UFormField>
      <UFormField label="Driver" name="driverId" help="Can be assigned later from the table.">
        <USelectMenu id="field-driverId" v-model="state.driverId" :items="driverItems" value-key="value" searchable class="w-full" />
      </UFormField>
    </fieldset>
    <fieldset class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <legend class="mb-2 text-sm font-semibold">Load</legend>
      <UFormField label="Weight" name="weightKg" required help="Kilograms, whole numbers; above 24,000 kg the load needs a permit.">
        <UInput id="field-weightKg" v-model="state.weightKg" type="number" inputmode="numeric" min="1" max="24000" class="w-full" :ui="{ trailing: 'pointer-events-none' }"><template #trailing><span class="text-xs text-fg-muted">kg</span></template></UInput>
      </UFormField>
      <UFormField label="Pallets" name="pallets" required help="An artic carries 33 at most.">
        <UInput id="field-pallets" v-model="state.pallets" type="number" inputmode="numeric" min="1" max="33" class="w-full" />
      </UFormField>
      <UFormField label="Notes" name="notes" class="sm:col-span-2" :help="`${(state.notes ?? '').length}/500`">
        <UTextarea id="field-notes" v-model="state.notes" :rows="3" class="w-full" maxlength="500" />
      </UFormField>
      <UFormField name="priority" class="sm:col-span-2">
        <UCheckbox id="field-priority" v-model="state.priority" label="Priority load" description="Dispatch plans it before standard loads of the same slot." />
      </UFormField>
    </fieldset>
    <div class="flex flex-wrap items-center gap-3">
      <UButton type="submit" label="Plan shipment" color="primary" :loading="busy" :disabled="busy" data-submit />
      <UButton label="Cancel" color="neutral" variant="ghost" to="/app/shipments" :disabled="busy" />
      <span v-if="busy" class="text-sm text-fg-muted" role="status">Saving…</span>
    </div>
  </UForm>
</template>
