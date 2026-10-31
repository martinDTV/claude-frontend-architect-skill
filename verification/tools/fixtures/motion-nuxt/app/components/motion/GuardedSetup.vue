<script setup lang="ts">
import gsap from 'gsap'

// guarded: the call only runs in the browser, and the tween is a one-off set
if (import.meta.client) gsap.set('.badge', { opacity: 0 })
</script>

<template>
  <span class="badge">New</span>
</template>
