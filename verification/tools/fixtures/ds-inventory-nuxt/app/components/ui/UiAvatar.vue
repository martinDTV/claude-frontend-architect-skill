<!-- @ds-ejected from="shadcn-vue/avatar" version="0.11.0" sha256="122d265c39433a10fcf59625e035bdc86b46fad4cf74c14ed8460d376b452d92" -->
<!-- UiAvatar — ejected from shadcn-vue. -->
<script setup lang="ts">
defineProps<{ src?: string; alt: string; size?: 'sm' | 'md' | 'lg' }>()
</script>

<template>
  <span class="inline-flex overflow-hidden rounded-full bg-[var(--color-surface)]" :class="{ 'size-6': size === 'sm', 'size-8': size !== 'sm' && size !== 'lg', 'size-12': size === 'lg' }">
    <img v-if="src" :src="src" :alt="alt" class="size-full object-cover" />
    <span v-else aria-hidden="true">{{ alt.split(' ').map((w) => w[0]).join('').slice(0, 2) }}</span>
  </span>
</template>
