<script setup lang="ts">
const { signIn } = useCredentials()
</script>
<template><button @click="signIn('a@b.c', 'pw')">Sign in</button></template>
