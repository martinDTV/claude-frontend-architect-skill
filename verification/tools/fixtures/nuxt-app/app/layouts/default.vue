<script setup lang="ts">
// Shell layout that reaches into a business domain (shell -> sales) through auto-imports.
const { canSee } = useFeatureFlags()
const auth = useAuthStore()
const ui = useUiStore()
const items = computed(() => (canSee('sales') ? ['sales'] : []))
</script>
<template>
  <div>
    <AppHeader :user="auth.user" />
    <SalesBadge v-if="items.length" status="activo" />
    <UiStateLoading v-if="ui.loading" />
    <slot />
  </div>
</template>
