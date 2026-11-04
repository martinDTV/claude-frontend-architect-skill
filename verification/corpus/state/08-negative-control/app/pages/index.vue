<script setup lang="ts">
const session = useSessionStore()
</script>
<template><p>{{ session.user?.id ?? 'anon' }}</p></template>
