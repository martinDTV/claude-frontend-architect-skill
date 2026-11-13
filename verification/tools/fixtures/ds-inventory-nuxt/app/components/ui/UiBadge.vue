<!-- @ds-ejected from="shadcn-vue/badge" version="0.11.0" sha256="d4ec9ded339edc1a6e5d830b9678de6cadf24c7901939fd28aa686005679164f" -->
<!-- UiBadge — status badge. Ejected from shadcn-vue so the project owns the source. -->
<script setup lang="ts">
import { tv, type VariantProps } from 'tailwind-variants'

const badge = tv({
  base: 'inline-flex items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium',
  variants: { variant: { default: 'bg-[var(--color-brand-500)] text-white', outline: 'border text-[var(--color-brand-600)]', destructive: 'bg-[var(--color-danger-500)] text-white' } },
  defaultVariants: { variant: 'default' },
})
type Props = { variant?: VariantProps<typeof badge>['variant'] }
defineProps<Props>()
</script>

<template>
  <span :class="badge({ variant })"><slot /></span>
</template>
