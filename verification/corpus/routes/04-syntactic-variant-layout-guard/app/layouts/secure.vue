<script setup lang="ts">
const { user } = useUserSession()
</script>
<template>
  <div>
    <header>{{ user?.name }}</header>
    <slot />
  </div>
</template>
