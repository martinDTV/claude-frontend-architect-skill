<script setup lang="ts">
import { shallowRef } from 'vue'
const current = shallowRef('CrmCard')
</script>
<template>
  <main>
    <component :is="current" />
    <component is="CrmCard" />
  </main>
</template>
