<script setup lang="ts">
// Status by word, shape and colour (contract R4: never colour alone).
import { STATUS_GLYPH, STATUS_LABEL, STATUS_TONE, type ShipmentStatus } from '~/lib/ui/saas/data'
const props = defineProps<{ status: ShipmentStatus }>()
const color = computed(() => ({ neutral: 'neutral', info: 'info', warning: 'warning', danger: 'error', success: 'success' } as const)[STATUS_TONE[props.status]])
</script>

<template>
  <UBadge :color="color" variant="subtle" size="sm" class="gap-1 font-medium" :data-status="status">
    <span aria-hidden="true">{{ STATUS_GLYPH[status] }}</span>{{ STATUS_LABEL[status] }}
  </UBadge>
</template>
