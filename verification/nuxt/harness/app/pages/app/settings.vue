<script setup lang="ts">
// Preferences: density, theme, table columns and page size; saved on change to a versioned localStorage record and
// applied at once; the save is confirmed inline and announced.
import { PAGE_SIZES } from '~/lib/ui/saas/table-state'

definePageMeta({ layout: 'app' })
useHead({ title: 'Settings' })
const { prefs, update } = usePreferences()
const toast = useToast()
const saved = ref<string | null>(null)
const columnItems = [
  { label: 'Reference', value: 'reference' }, { label: 'Customer', value: 'customer' }, { label: 'Lane', value: 'lane' }, { label: 'Status', value: 'status' },
  { label: 'Promised', value: 'promised' }, { label: 'ETA', value: 'eta' }, { label: 'Weight', value: 'weightKg' }, { label: 'Pallets', value: 'pallets' }, { label: 'Updated', value: 'updatedAt' },
]
const densityItems = [{ label: 'Compact (32px rows, the default for dispatch)', value: 'compact' }, { label: 'Comfortable (40px rows)', value: 'comfortable' }]
const themeItems = [{ label: 'Follow the system', value: 'system' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]
const sizeItems = PAGE_SIZES.map((n) => ({ label: `${n} rows per page`, value: n as number }))
const density = computed({ get: () => prefs.value.density, set: (v) => save({ density: v }) })
const theme = computed({ get: () => prefs.value.theme, set: (v) => save({ theme: v }) })
const columns = computed({ get: () => prefs.value.columns, set: (v) => save({ columns: v }) })
const pageSize = computed({ get: () => prefs.value.pageSize, set: (v) => save({ pageSize: v }) })
function save(patch: Parameters<typeof update>[0]) {
  update(patch)
  saved.value = `Saved · ${new Date().toLocaleTimeString('en-GB')}`
  toast.add({ title: 'Preference saved', description: 'Applied on this device.', color: 'success', icon: 'i-lucide-check' })
}
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header><UDashboardNavbar title="Settings" /></template>
    <template #body>
      <main id="main" class="max-w-2xl space-y-8" tabindex="-1">
        <h1 class="sr-only">Settings</h1>
        <p class="text-sm text-fg-muted" aria-live="polite" data-saved>{{ saved ?? 'Changes save as you make them, on this device.' }}</p>
        <UFormField label="Density" name="density" help="Row height and padding; nothing else changes.">
          <URadioGroup v-model="density" :items="densityItems" value-key="value" data-pref="density" />
        </UFormField>
        <UFormField label="Theme" name="theme">
          <USelect v-model="theme" :items="themeItems" value-key="value" class="w-60" data-pref="theme" />
        </UFormField>
        <UFormField label="Shipment table columns" name="columns" help="At least reference and status stay visible.">
          <UCheckboxGroup v-model="columns" :items="columnItems" value-key="value" data-pref="columns" />
        </UFormField>
        <UFormField label="Rows per page" name="pageSize">
          <USelect v-model="pageSize" :items="sizeItems" value-key="value" class="w-60" data-pref="pageSize" />
        </UFormField>
      </main>
    </template>
  </UDashboardPanel>
</template>
