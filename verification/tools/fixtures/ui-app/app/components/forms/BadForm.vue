<script setup lang="ts">
import { ref } from 'vue'
const name = ref('')
function save() {
  // no pending flag anywhere in this component
}
</script>
<template>
  <form @submit.prevent="save">
    <h1>Profile</h1>
    <h3>Details</h3>
    <input v-model="name" type="text" />
    <select name="plan"><option>Free</option></select>
    <textarea name="bio"></textarea>
    <input id="agree" type="checkbox" aria-invalid="true" />
    <button type="submit"></button>
    <button type="button"><IconTrash /></button>
    <a @click="save">Save as draft</a>
    <div @click="save">Save</div>
    <span role="button" @click="save">Save too</span>
    <a href="/x"><button type="button">Nested</button></a>
    <button type="button" aria-hidden="true">Hidden but focusable</button>
    <input type="text" tabindex="3" aria-label="Order" />
    <img src="/avatar.png" />
    <input type="image" src="/go.png" />
    <iframe src="https://example.com/embed"></iframe>
    <div role="buton">typo</div>
    <div aria-labelled="x">typo attr</div>
    <div role="dialog">no accessible name</div>
    <table><tr><td>1</td></tr></table>
    <li @mouseover="save">hover only</li>
    <div class="chip-box" @click="box?.focus()"><input ref="box" aria-label="Tags" type="text" /></div>
  </form>
</template>
