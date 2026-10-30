<script setup lang="ts">
import { ref } from 'vue'
// runs during server rendering: window does not exist there
const width = ref(window.innerWidth)
const theme = localStorage.getItem('theme')
</script>
<template><p :data-theme="theme">{{ width }}</p></template>
