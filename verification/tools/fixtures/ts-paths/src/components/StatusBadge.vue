<script setup lang="ts">
import type { OrderStatus } from '#core/orders'
defineProps<{ status: OrderStatus }>()
</script>
<template><span>{{ status }}</span></template>
