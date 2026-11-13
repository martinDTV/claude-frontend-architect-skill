<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <span class="rounded-full px-2 py-0.5 text-xs bg-[#123456] text-white" style="box-shadow: 0 0 0 1px #ff0066">{{ text }}</span>
</template>
