<script setup lang="ts">
// Drifts from the token layer on purpose: every line below is a finding of a known class.
const accent = '#ff0000'
</script>

<template>
  <section class="rounded-md bg-[#ff0000] p-[13px] text-[rgb(10,20,30)] shadow-[0_2px_8px_rgba(0,0,0,0.3)] duration-[350ms] z-[999] font-[Comic_Sans]" :class="{ 'border-[#00ff00]': true }">
    <h2 class="text-[17px] leading-[1.3] gap-[8px]">Drift</h2>
    <p style="color: #333333; margin-top: 7px; font-family: Georgia, serif">Inline literals</p>
    <button class="px-[16px] py-[12px] bg-accent text-accent-fg">On the grid, outside the scale</button>
    <span :style="{ color: accent }">A dynamic style carries no literal</span>
  </section>
</template>

<style scoped>
.card { color: #222; background: rgb(250, 250, 250); font-size: 14px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); transition: opacity 250ms ease; z-index: 120; padding: 10px; }
.card--token { color: var(--fg); padding: var(--space-16); --local-tint: #abcdef; }
</style>
