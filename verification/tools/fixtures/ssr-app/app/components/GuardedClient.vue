<script setup lang="ts">
import { ref } from 'vue'
const theme = ref('light')
if (import.meta.client) theme.value = localStorage.getItem('theme') ?? 'light'
const dark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
</script>
<template><p :class="{ dark }">{{ theme }}</p></template>
