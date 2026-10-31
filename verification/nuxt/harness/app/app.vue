<script setup lang="ts">
// the enterprise application (/app) and the shop (/shop) own their frame through their layouts (layouts/app.vue,
// layouts/shop.vue); the harness navigation shows on every other page
const route = useRoute()
const isApp = computed(() => ['/app', '/shop'].some((base) => route.path === base || route.path.startsWith(`${base}/`)))
</script>

<template>
  <UApp>
    <!-- the harness navigation wraps at every width and text size (SC 1.4.10 reflow at 320 px, 200% text) -->
    <nav v-if="!isApp" aria-label="Primary" class="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-sm [&>a]:inline-block [&>a]:py-1.5">
      <NuxtLink to="/">Home</NuxtLink>
      <NuxtLink to="/motion">Motion</NuxtLink>
      <NuxtLink to="/motion-second">Second</NuxtLink>
      <NuxtLink to="/design">Design</NuxtLink>
      <NuxtLink to="/app">Atlas app</NuxtLink>
      <NuxtLink to="/shop">Ember shop</NuxtLink>
      <NuxtLink to="/lab/shaders">Shader lab</NuxtLink>
      <NuxtLink to="/lab/particles">Particle lab</NuxtLink>
      <NuxtLink to="/lab/product">Product</NuxtLink>
      <NuxtLink to="/lab/field">Field</NuxtLink>
      <NuxtLink to="/lab/story">Story</NuxtLink>
      <NuxtLink to="/lab/assets">Assets</NuxtLink>
      <NuxtLink to="/lab/atelier-tres">Atelier Tres</NuxtLink>
      <NuxtLink to="/lab/atelier">Atelier</NuxtLink>
    </nav>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
