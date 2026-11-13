<!--
  DsSelect — a labelled native select (keyboard, mobile pickers and screen readers for free). Options carry a value
  and a label; the model is the selected value or null.
  @example <DsSelect v-model="country" label="Country" :options="countries" placeholder="Choose a country" />
-->
<script setup lang="ts" generic="T extends string | number">
const props = withDefaults(defineProps<{ options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>; label: string; placeholder?: string; error?: string }>(), { placeholder: 'Select an option' })
const model = defineModel<T | null>({ required: true })
const emit = defineEmits<{ change: [value: T] }>()
function onChange(event: Event) {
  const index = (event.target as HTMLSelectElement).selectedIndex - 1
  const option = props.options[index]
  if (!option) return
  model.value = option.value
  emit('change', option.value)
}
</script>

<template>
  <DsField :label="label" :error="error" v-slot="{ id, describedBy, invalid }">
    <select :id="id" :value="model ?? ''" :aria-describedby="describedBy" :aria-invalid="invalid || undefined" class="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" @change="onChange">
      <option value="" disabled>{{ placeholder }}</option>
      <option v-for="o in options" :key="String(o.value)" :value="o.value" :disabled="o.disabled">{{ o.label }}</option>
    </select>
  </DsField>
</template>
