<script setup lang="ts">
// formatMoney is published by @acme/ui but declared in @acme/shared: two barrel hops
import { formatMoney, nothingHere } from '@acme/ui'
const text = formatMoney(5) + String(nothingHere)
</script>
<template><span>{{ text }}</span></template>
