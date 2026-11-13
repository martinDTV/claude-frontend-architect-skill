<!-- UiBrandMark — the wordmark; lives in the brand layer so a tenant can replace it. -->
<script setup lang="ts">
defineProps<{ size?: 'sm' | 'md' }>()
</script>

<template>
  <span class="font-semibold text-[var(--color-brand-600)]" :class="size === 'sm' ? 'text-sm' : 'text-lg'">Atlas</span>
</template>
