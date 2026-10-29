<script setup lang="ts">
import { Button } from '@acme/ui'
import { formatMoney } from '@acme/shared'
import type { Size } from '@acme/ui'
import leftPad from 'left-pad'
const label = formatMoney(1200)
const size: Size = 'md'
</script>
<template><p>{{ Button(label) }} {{ size }} {{ leftPad('x', 3) }}</p></template>
