<script setup lang="ts">
import { ref } from 'vue'
const open = ref(false)
</script>
<template>
  <article>
    <sales-badge status="kebab" />
    <LazySalesBadge status="lazy" />
    <Transition name="fade"><p v-if="open">details</p></Transition>
  </article>
</template>
