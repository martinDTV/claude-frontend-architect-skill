<script setup lang="ts">
// different value on the server and on the client: hydration mismatch
const id = `row-${Math.random().toString(36).slice(2)}`
const stamp = Date.now()
</script>
<template><div :id="id">{{ stamp }}</div></template>
