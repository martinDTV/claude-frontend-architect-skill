<script setup lang="ts">
import gsap from 'gsap'

// a .client.vue component never renders on the server: the top-level set is fine here
gsap.set('.spark', { opacity: 0 })
</script>

<template>
  <span class="spark" />
</template>
