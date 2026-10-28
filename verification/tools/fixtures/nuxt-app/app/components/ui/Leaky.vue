<script setup lang="ts">
// Shared UI importing a feature's internals: a boundary violation.
import { computeTotal } from '~/features/orders/internal'
const total = computeTotal([1, 2])
</script>
<template><span>{{ total }}</span></template>
