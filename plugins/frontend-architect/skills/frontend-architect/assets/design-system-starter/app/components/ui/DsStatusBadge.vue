<!--
  DsStatusBadge — a status, named by its tone and its text (never colour alone). Variants come from tailwind-variants;
  every colour is a contract role.
  @example <DsStatusBadge tone="success">Delivered</DsStatusBadge>
-->
<script setup lang="ts">
import { tv } from 'tailwind-variants'

withDefaults(defineProps<{ tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }>(), { tone: 'neutral' })

const badge = tv({
  base: 'inline-flex items-center gap-1 rounded-[var(--radius-full)] px-2 py-0.5 text-xs font-medium',
  variants: {
    tone: {
      neutral: 'bg-[var(--surface-raised)] text-[var(--fg)]',
      info: 'bg-[var(--info)] text-[var(--info-fg)]',
      success: 'bg-[var(--success)] text-[var(--success-fg)]',
      warning: 'bg-[var(--warning)] text-[var(--warning-fg)]',
      danger: 'bg-[var(--danger)] text-[var(--danger-fg)]',
    },
  },
  defaultVariants: { tone: 'neutral' },
})
</script>

<template>
  <span :class="badge({ tone })"><slot /></span>
</template>
