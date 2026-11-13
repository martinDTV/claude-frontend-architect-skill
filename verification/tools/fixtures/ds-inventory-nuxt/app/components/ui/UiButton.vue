<!--
  UiButton — the one button. Variants come from tailwind-variants; colours from the token layer.
  @example <UiButton variant="ghost" size="sm" @click="save">Save</UiButton>
-->
<script setup lang="ts">
import { tv } from 'tailwind-variants'

const props = defineProps({
  variant: { type: String as () => 'solid' | 'ghost' | 'danger', default: 'solid' },
  size: { type: String as () => 'xs' | 'sm' | 'md', default: 'md' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits<{ click: [event: MouseEvent] }>()

const button = tv({
  base: 'inline-flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] font-medium',
  variants: {
    variant: {
      solid: 'bg-[var(--color-brand-500)] text-white hover:bg-[var(--color-brand-600)]',
      ghost: 'bg-transparent text-[var(--color-brand-600)]',
      danger: 'bg-[var(--color-danger-500)] text-white',
    },
    size: { xs: 'px-2 py-1 text-xs', sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-base' },
    disabled: { true: 'opacity-50 pointer-events-none' },
  },
  defaultVariants: { variant: 'solid', size: 'md' },
})

function onClick(event: MouseEvent) {
  if (props.disabled || props.loading) return
  emit('click', event)
}
</script>

<template>
  <button type="button" :class="button({ variant, size, disabled })" :disabled="disabled" :aria-busy="loading || undefined" @click="onClick">
    <slot name="icon" />
    <slot />
  </button>
</template>
