<script setup lang="ts">
import { ref } from 'vue'
const email = ref('')
const avatarAlt = ref('Avatar of the user')
</script>
<template>
  <!-- a wrapper component owns the label: the native input inside its slot is not reported -->
  <FormField label="Email">
    <input v-model="email" type="email" />
  </FormField>
  <!-- bound attributes cannot be verified statically: counted as "browser" checks, not defects -->
  <img src="/avatar.png" :alt="avatarAlt" />
  <input :aria-label="`Search ${email}`" type="search" />
  <button type="button" :aria-label="email ? 'Clear' : 'Nothing to clear'"><svg aria-hidden="true" /></button>
  <input ref="file" type="file" class="hidden" @change="email = 'uploaded'" />
</template>
