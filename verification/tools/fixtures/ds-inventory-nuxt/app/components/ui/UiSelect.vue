<script setup lang="ts" generic="T extends string | number">
const props = withDefaults(
  defineProps<{
    options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>
    label: string
    placeholder?: string
  }>(),
  { placeholder: 'Select an option' },
)
const model = defineModel<T | null>({ required: true })
const emit = defineEmits<{ change: [value: T] }>()
defineSlots<{ option?: (props: { label: string; selected: boolean }) => unknown }>()
const id = useId()

function onChange(event: Event) {
  const index = (event.target as HTMLSelectElement).selectedIndex - 1
  const option = props.options[index]
  if (!option) return
  model.value = option.value
  emit('change', option.value)
}
</script>

<template>
  <div class="flex flex-col gap-[var(--space-2)]">
    <label :for="id">{{ label }}</label>
    <select :id="id" :value="model ?? ''" @change="onChange">
      <option value="" disabled>{{ placeholder }}</option>
      <option v-for="o in options" :key="o.value" :value="o.value" :disabled="o.disabled">
        <slot name="option" :label="o.label" :selected="o.value === model">{{ o.label }}</slot>
      </option>
    </select>
  </div>
</template>
