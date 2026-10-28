<script setup lang="ts">
// Shell layout that reaches into a business domain (shell -> crm) through auto-imports.
const { veModulo } = useSettingComercial()
const auth = useAuthStore()
const ui = useUiStore()
const items = computed(() => (veModulo('crm') ? ['crm'] : []))
</script>
<template>
  <div>
    <AppHeader :user="auth.user" />
    <CrmBadge v-if="items.length" estado="activo" />
    <UiStateLoading v-if="ui.loading" />
    <slot />
  </div>
</template>
