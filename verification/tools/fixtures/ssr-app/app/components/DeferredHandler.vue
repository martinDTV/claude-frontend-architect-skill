<script setup lang="ts">
// browser API inside an event handler: it runs after an interaction, never during render
function copy() {
  navigator.clipboard.writeText(location.href)
}
</script>
<template><button type="button" @click="copy">Copy link</button></template>
