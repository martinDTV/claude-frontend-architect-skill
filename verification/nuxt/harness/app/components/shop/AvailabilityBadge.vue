<script setup lang="ts">
// Availability by word and shape; colour is secondary (R3): "Sold out" keeps full contrast.
import { AVAILABILITY_GLYPH, AVAILABILITY_LABEL, type Availability } from '~/lib/ui/shop/catalog'
defineProps<{ value: Availability }>()
const tone: Record<Availability, string> = { 'in-stock': 'text-success', 'last-few': 'text-warning', 'sold-out': 'text-fg', 'made-to-order': 'text-info' }
</script>

<template>
  <span class="inline-flex items-center gap-1 text-sm font-medium" :class="tone[value]" :data-availability="value"><span aria-hidden="true">{{ AVAILABILITY_GLYPH[value] }}</span>{{ AVAILABILITY_LABEL[value] }}</span>
</template>
