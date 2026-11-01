<script setup lang="ts">
// Preferences: density, theme, table columns and page size; saved on change to a versioned localStorage record and
// applied at once; the save is confirmed inline and announced.
import { PAGE_SIZES } from '~/lib/ui/saas/table-state'

definePageMeta({ layout: 'app' })
useHead({ title: 'Settings' })
const { prefs, update } = usePreferences()
const toast = useToast()
const saved = ref<string | null>(null)
// reference and status are always shown: their boxes are checked and locked, as the help text says
const columnItems = [
  { label: 'Reference', value: 'reference', disabled: true }, { label: 'Customer', value: 'customer' }, { label: 'Lane', value: 'lane' }, { label: 'Status', value: 'status', disabled: true },
  { label: 'Promised', value: 'promised' }, { label: 'ETA', value: 'eta' }, { label: 'Weight', value: 'weightKg' }, { label: 'Pallets', value: 'pallets' }, { label: 'Updated', value: 'updatedAt' },
]
const densityItems = [{ label: 'Compact (32px rows, the default for dispatch)', value: 'compact' }, { label: 'Comfortable (40px rows)', value: 'comfortable' }]
const themeItems = [{ label: 'Follow the system', value: 'system' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]
const sizeItems = PAGE_SIZES.map((n) => ({ label: `${n} rows per page`, value: n as number }))
const density = computed({ get: () => prefs.value.density, set: (v) => save({ density: v }) })
const theme = computed({ get: () => prefs.value.theme, set: (v) => save({ theme: v }) })
// one checkbox per column, each its own Tab stop (the checkbox pattern, as in the Next app); the locked two always stay
const toggleColumn = (key: string, on: boolean | 'indeterminate') => save({ columns: columnItems.map((c) => c.value).filter((k) => k === 'reference' || k === 'status' || (k === key ? on === true : prefs.value.columns.includes(k))) })
const pageSize = computed({ get: () => prefs.value.pageSize, set: (v) => save({ pageSize: v }) })
function save(patch: Parameters<typeof update>[0]) {
  update(patch)
  saved.value = `Saved · ${new Date().toLocaleTimeString('en-GB')}`
  toast.add({ title: 'Preference saved', description: 'Applied on this device.', color: 'success', icon: 'i-lucide-check' })
}
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header><header><UDashboardNavbar title="Settings" :toggle="NAV_TOGGLE" :ui="NAVBAR_UI" /></header></template>
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
        <!-- a fieldset, not a UFormField: the field's label must not become every checkbox's name; each box is named by its
             own label and is its own Tab stop (the checkbox pattern), the two always-on columns checked and disabled -->
        <fieldset>
          <legend class="text-sm font-medium">Shipment table columns</legend>
          <p class="mt-1 mb-2 text-xs text-fg-muted">At least reference and status stay visible.</p>
          <div class="grid gap-2 sm:grid-cols-2" data-pref="columns">
            <UCheckbox v-for="c in columnItems" :key="c.value" :model-value="prefs.columns.includes(c.value)" :label="c.label" :disabled="c.disabled" @update:model-value="toggleColumn(c.value, $event)" />
          </div>
        </fieldset>
        <UFormField label="Rows per page" name="pageSize">
          <USelect v-model="pageSize" :items="sizeItems" value-key="value" class="w-60" data-pref="pageSize" />
        </UFormField>
      </main>
    </template>
  </UDashboardPanel>
</template>
