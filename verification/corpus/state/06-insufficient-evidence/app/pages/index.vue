<script setup lang="ts">
const { dismissPasswordTips } = useOnboarding()
</script>
<template><button @click="dismissPasswordTips()">Got it</button></template>
