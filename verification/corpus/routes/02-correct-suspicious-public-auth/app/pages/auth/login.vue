<script setup lang="ts">
const email = ref('')
const password = ref('')
async function submit() { await $fetch('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } }) }
</script>
<template><form @submit.prevent="submit"><input v-model="email" /><input v-model="password" type="password" /></form></template>
