<!--
  DsIconButton — an icon-only button. The accessible name is a required prop, so an unnamed control cannot be built.
  @example <DsIconButton icon="i-lucide-x" label="Close" @click="close" />
-->
<script setup lang="ts">
withDefaults(defineProps<{ icon: string; label: string; tone?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }>(), { tone: 'secondary', disabled: false })
defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <UButton :icon="icon" :aria-label="label" :title="label" :color="tone === 'danger' ? 'error' : tone === 'primary' ? 'primary' : 'neutral'" variant="ghost" :disabled="disabled" square @click="$emit('click', $event)" />
</template>
