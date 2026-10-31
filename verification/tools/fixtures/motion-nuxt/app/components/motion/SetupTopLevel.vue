<script setup lang="ts">
import gsap from 'gsap'

// runs during server rendering: gsap touches the DOM at the top level of <script setup>
const heading = ref<HTMLElement | null>(null)
gsap.to('.hero-title', { opacity: 1, duration: 0.6 })
</script>

<template>
  <h1 ref="heading" class="hero-title">Hello</h1>
</template>
