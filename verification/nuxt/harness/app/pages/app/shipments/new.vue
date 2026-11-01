<script setup lang="ts">
import { apiModeFrom } from '~/lib/ui/saas/forms'

definePageMeta({ layout: 'app' })
useHead({ title: 'New shipment' })
const route = useRoute()
const router = useRouter()
const mode = computed(() => apiModeFrom(new URLSearchParams(route.query as Record<string, string>)))
function onCreated(reference: string) {
  router.push({ path: '/app/shipments', query: { q: reference, created: reference } })
}
</script>

<template>
  <UDashboardPanel id="new-shipment">
    <template #header><header><UDashboardNavbar title="New shipment" :toggle="NAV_TOGGLE" :ui="NAVBAR_UI" /></header></template>
    <template #body>
      <main id="main" tabindex="-1">
        <h1 class="sr-only">New shipment</h1>
        <p class="mb-6 max-w-2xl text-sm text-fg-muted">Plan a load for a customer. Fields marked with an asterisk are required; the reference must be unique.</p>
        <AppShipmentForm :mode="mode" @created="onCreated" />
      </main>
    </template>
  </UDashboardPanel>
</template>
