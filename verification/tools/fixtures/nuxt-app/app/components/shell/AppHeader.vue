<script setup lang="ts">
defineProps<{ user: unknown }>()
const ui = useUiStore()
</script>
<template><header @click="ui.toggle()">Header</header></template>
