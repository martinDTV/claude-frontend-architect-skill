<script setup lang="ts">
// Correct markup the static rules must not report (1.5.0): named or hidden images, a button named by its image, a
// focusable taken out of the tab order before being hidden, document and graphics roles, a link that is a button, and
// the members of a listbox that the container manages with aria-activedescendant.
const close = () => {}
const pick = (id: string) => void id
</script>

<template>
  <div>
    <img src="/decor.png" aria-hidden="true" />
    <img src="/avatar.png" aria-label="Ada Lovelace" />
    <img src="/chart.png" aria-labelledby="chart-title" />
    <button type="button" @click="close"><img src="/x.svg" alt="Close" /></button>
    <button type="button" aria-hidden="true" tabindex="-1" @click="close">hidden twin</button>
    <section role="doc-chapter"><h2 role="doc-subtitle">Chapter</h2></section>
    <svg role="graphics-document" aria-label="Map"><circle r="1" /></svg>
    <a role="button" tabindex="0" @click="close" @keydown.enter="close">Dismiss</a>
    <ul role="listbox" tabindex="0" aria-activedescendant="opt-1" aria-label="Lanes">
      <li id="opt-1" role="option" aria-selected="true" @click="pick('1')">BIL-MAD</li>
      <li id="opt-2" role="option" aria-selected="false" @click="pick('2')">ZAR-VAL</li>
    </ul>
    <div class="backdrop" @click.self="close"><p>dialog body</p></div>
  </div>
</template>
