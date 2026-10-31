<template>
  <!-- tokens only; the drawing keeps its own colours -->
  <article class="rounded-md border border-border bg-surface p-4 text-fg shadow-(--shadow-card)">
    <h2 class="text-(length:--text-xl) font-serif">Clean</h2>
    <svg viewBox="0 0 10 10" role="img" aria-label="A red dot"><circle cx="5" cy="5" r="4" fill="#d33" stroke="rgb(0,0,0)" /></svg>
    <p class="text-fg-muted" style="color: var(--fg-muted)">Through variables</p>
    <i class="inline-block size-2 rounded-full" style="background: #f3efe8" aria-hidden="true" />
  </article>
</template>

<style scoped>
.art { fill: #336699; }
.ok { color: var(--accent); transition: opacity var(--duration-fast) var(--ease-standard); }
</style>
