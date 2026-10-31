<script setup lang="ts">
// Atlas Logistics shell (enterprise-ui-patterns.md: navigation for many modules; layout-and-responsive.md): a 272px
// sidebar that collapses to icons and becomes a drawer on small screens (Nuxt UI's dashboard components), a skip link,
// the search palette on Cmd/Ctrl+K, the theme switch in the sidebar footer. The density preference lands on <html>.
import { DATASET, STATUS_LABEL } from '~/lib/ui/saas/data'

const route = useRoute()
usePreferences()
const items = computed(() => [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/app', active: route.path === '/app' },
  { label: 'Shipments', icon: 'i-lucide-package', to: '/app/shipments', active: route.path.startsWith('/app/shipments') && route.path !== '/app/shipments/new' },
  { label: 'New shipment', icon: 'i-lucide-plus-square', to: '/app/shipments/new', active: route.path === '/app/shipments/new' },
  { label: 'Fleet', icon: 'i-lucide-truck', to: '/app/fleet', active: route.path === '/app/fleet' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/app/settings', active: route.path === '/app/settings' },
])
const searchOpen = ref(false)
defineShortcuts({ meta_k: () => { searchOpen.value = !searchOpen.value } })
const searchGroups = computed(() => [
  { id: 'pages', label: 'Pages', items: items.value.map((i) => ({ label: i.label, icon: i.icon, to: i.to })) },
  { id: 'shipments', label: 'Shipments', items: DATASET.shipments.slice(0, 60).map((s) => ({ label: `${s.reference} · ${s.customer}`, suffix: `${s.lane} · ${STATUS_LABEL[s.status]}`, icon: 'i-lucide-package', to: { path: '/app/shipments', query: { q: s.reference } } })) },
])
</script>

<template>
  <UDashboardGroup>
    <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-fg">Skip to content</a>
    <UDashboardSidebar id="atlas-sidebar" collapsible resizable :min-size="12" :default-size="17" :max-size="22" :ui="{ footer: 'border-t border-border' }">
      <template #header="{ collapsed }">
        <NuxtLink to="/app" class="flex min-w-0 items-center gap-2 font-semibold tracking-tight">
          <span class="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-accent text-accent-fg text-xs font-bold" aria-hidden="true">A</span>
          <span :class="collapsed ? 'sr-only' : 'truncate'">Atlas Logistics</span>
        </NuxtLink>
        <UDashboardSidebarCollapse v-if="!collapsed" class="ms-auto" aria-label="Collapse sidebar" data-sidebar-collapse />
      </template>
      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" label="Search" />
        <UNavigationMenu :collapsed="collapsed" :items="items" orientation="vertical" aria-label="Application" />
      </template>
      <template #footer="{ collapsed }">
        <div class="flex items-center justify-between gap-2 px-1 py-1">
          <span v-if="!collapsed" class="text-xs text-fg-muted">Dispatch · Bilbao</span>
          <UColorModeButton aria-label="Toggle colour theme" />
        </div>
      </template>
    </UDashboardSidebar>
    <UDashboardSearch v-model:open="searchOpen" :groups="searchGroups" placeholder="Search shipments, pages…" />
    <slot />
  </UDashboardGroup>
</template>
