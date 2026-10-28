<script setup lang="ts">
import { useOrders } from '~/features/orders'
import { computeTotal } from '~/features/orders/internal'
const orders = useOrders()
const t = computeTotal([1])
</script>
<template><div>{{ t }} {{ orders }}</div></template>
