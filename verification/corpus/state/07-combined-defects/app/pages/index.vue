<script setup lang="ts">
const account = useAccountStore()
</script>
<template><p>{{ account.invoices.length }}</p></template>
