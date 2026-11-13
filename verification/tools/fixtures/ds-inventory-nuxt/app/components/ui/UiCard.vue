<!-- UiCard — "for consistency": re-exports UCard unchanged. -->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
</script>

<template>
  <UCard v-bind="$attrs">
    <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope ?? {}" /></template>
  </UCard>
</template>
