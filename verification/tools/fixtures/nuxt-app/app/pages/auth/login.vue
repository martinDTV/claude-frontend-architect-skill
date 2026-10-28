<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const auth = useAuthStore()
</script>
<template>
  <form @submit.prevent="auth.login('a', 'b')"><button>Entrar</button></form>
</template>
