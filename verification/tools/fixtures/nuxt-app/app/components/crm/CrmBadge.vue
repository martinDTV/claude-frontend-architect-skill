<script setup lang="ts">
defineProps<{ estado: string }>()
</script>
<template><span class="badge">{{ estado }}</span></template>
