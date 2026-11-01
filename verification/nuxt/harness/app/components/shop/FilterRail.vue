<script setup lang="ts">
// Filters are the main navigation (R2): checkboxes inside fieldsets with legends, operable with a thumb and a keyboard;
// each change writes the URL. The same component is the left rail at 1024px and above and the content of the filter
// sheet below.
import { AVAILABILITY_LABEL, FORM_LABEL, FORMS, GLAZES, MAKERS, type Availability, type CatalogState } from '~/lib/ui/shop/catalog'

// the sheet already has a title: inside it the rail shows no heading of its own
const props = withDefaults(defineProps<{ state: CatalogState; counts: { total: number }; heading?: boolean }>(), { heading: true })
const emit = defineEmits<{ toggle: [key: 'makers' | 'forms' | 'glazes' | 'availability', value: string]; clear: [] }>()
const AVAILABILITIES: Availability[] = ['in-stock', 'last-few', 'made-to-order', 'sold-out']
const active = computed(() => props.state.makers.length + props.state.forms.length + props.state.glazes.length + props.state.availability.length)
</script>

<template>
  <div class="space-y-6" data-filter-rail>
    <div v-if="heading || active" class="flex items-baseline justify-between gap-2">
      <h2 v-if="heading" class="font-serif text-lg">Filter</h2>
      <UButton v-if="active" label="Clear all" variant="link" color="neutral" size="sm" class="ms-auto" data-clear-filters @click="emit('clear')" />
    </div>
    <fieldset>
      <legend class="mb-2 text-sm font-semibold">Maker</legend>
      <div class="space-y-1.5">
        <UCheckbox v-for="m in MAKERS" :key="m.id" :model-value="state.makers.includes(m.id)" :label="m.name" :data-filter="`maker:${m.id}`" @update:model-value="emit('toggle', 'makers', m.id)" />
      </div>
    </fieldset>
    <fieldset>
      <legend class="mb-2 text-sm font-semibold">Form</legend>
      <div class="space-y-1.5">
        <UCheckbox v-for="f in FORMS" :key="f" :model-value="state.forms.includes(f)" :label="FORM_LABEL[f]" :data-filter="`form:${f}`" @update:model-value="emit('toggle', 'forms', f)" />
      </div>
    </fieldset>
    <fieldset>
      <legend class="mb-2 text-sm font-semibold">Glaze</legend>
      <div class="space-y-1.5">
        <UCheckbox v-for="g in GLAZES" :key="g.id" :model-value="state.glazes.includes(g.id)" :data-filter="`glaze:${g.id}`" @update:model-value="emit('toggle', 'glazes', g.id)">
          <template #label><span class="inline-flex items-center gap-2"><span class="inline-block size-3.5 rounded-full border border-border-strong" :style="{ background: g.hex }" aria-hidden="true" />{{ g.name }}</span></template>
        </UCheckbox>
      </div>
    </fieldset>
    <fieldset>
      <legend class="mb-2 text-sm font-semibold">Availability</legend>
      <div class="space-y-1.5">
        <UCheckbox v-for="a in AVAILABILITIES" :key="a" :model-value="state.availability.includes(a)" :label="AVAILABILITY_LABEL[a]" :data-filter="`availability:${a}`" @update:model-value="emit('toggle', 'availability', a)" />
      </div>
    </fieldset>
  </div>
</template>
