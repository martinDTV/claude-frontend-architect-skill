<script setup lang="ts">
const { currentTenant } = useTenant()
</script>
<template><p>{{ currentTenant() ?? 'none' }}</p></template>
