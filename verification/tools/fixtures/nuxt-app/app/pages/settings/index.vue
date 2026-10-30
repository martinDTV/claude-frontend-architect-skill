<script setup lang="ts">
// D1 (1.4): middleware array with comments inside; the regex parser of 1.3 lost the names and reported the page as unguarded
definePageMeta({
  middleware: [
    'auth', // session required
    /* second factor for this screen */ 'step-up',
  ],
})
</script>
<template><h1>Settings</h1></template>
