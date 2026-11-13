<!-- UiIconButton — an icon-only button; the accessible name is required. -->
<script setup lang="ts">
import { buttonProps } from './button.props'

defineProps({
  ...buttonProps,
  label: { type: String, required: true },
  icon: { type: String, required: true },
})
defineEmits<{ click: [] }>()
</script>

<template>
  <button type="button" :aria-label="label" class="rounded-[var(--radius-pill)] p-[var(--space-2)]" @click="$emit('click')">
    <UIcon :name="icon" aria-hidden="true" />
  </button>
</template>
