<script setup lang="ts">
import { shallowRef } from 'vue'
const current = shallowRef('SalesCard')
</script>
<template>
  <main>
    <component :is="current" />
    <component is="SalesCard" />
  </main>
</template>
