<script setup lang="ts">
defineProps<{ status: string }>()
</script>
<template><span class="badge">{{ status }}</span></template>
