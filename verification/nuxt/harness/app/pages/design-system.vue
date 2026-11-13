<script setup lang="ts">
// 1.8 increment 5: the design-system starter (layers/ds-starter, copied from the skill's assets by extract.mjs) rendered
// in every state, so the gate type-checks the layer and browser-audit (axe, keyboard, responsive) runs over it.
import type { DataView } from '../../layers/ds-starter/app/components/ui/data-view'

useHead({ title: 'Design system starter' })

type Row = { id: string; customer: string; status: 'pending' | 'delivered' | 'failed' }
const rows: Row[] = [
  { id: 'S-1001', customer: 'Acme', status: 'delivered' },
  { id: 'S-1002', customer: 'Globex', status: 'pending' },
  { id: 'S-1003', customer: 'Initech', status: 'failed' },
]
const views: Array<[string, DataView<Row>]> = [
  ['loading', { status: 'loading' }],
  ['empty', { status: 'empty' }],
  ['error', { status: 'error', message: 'The shipments service did not answer', retry: () => {} }],
  ['partial', { status: 'partial', rows, failed: 2, retry: () => {} }],
  ['success', { status: 'success', rows }],
]
const country = ref<string | null>(null)
const countries = [{ value: 'es', label: 'Spain' }, { value: 'mx', label: 'Mexico' }, { value: 'pt', label: 'Portugal' }]
const dialogOpen = ref(false)
const saving = ref(false)
const toneOf = (s: Row['status']) => (s === 'delivered' ? 'success' : s === 'failed' ? 'danger' : 'info')
</script>

<template>
  <main class="mx-auto flex max-w-5xl flex-col gap-10 p-6" data-ds-starter>
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold text-[var(--fg)]">Design system starter</h1>
      <p class="text-[var(--fg-muted)]">Nine components, every state, every colour a contract role.</p>
    </header>

    <section aria-labelledby="h-buttons" class="flex flex-col gap-3">
      <h2 id="h-buttons" class="text-lg font-medium">Buttons</h2>
      <div class="flex flex-wrap items-center gap-3">
        <DsButton>Primary</DsButton>
        <DsButton tone="secondary">Secondary</DsButton>
        <DsButton tone="danger">Delete</DsButton>
        <DsButton size="sm">Small</DsButton>
        <DsButton :loading="saving" @click="saving = true">{{ saving ? 'Saving…' : 'Save' }}</DsButton>
        <DsButton disabled>Disabled</DsButton>
        <DsIconButton icon="i-lucide-x" label="Close" />
        <DsIconButton icon="i-lucide-trash-2" label="Delete row" tone="danger" />
      </div>
    </section>

    <section aria-labelledby="h-forms" class="flex max-w-md flex-col gap-4">
      <h2 id="h-forms" class="text-lg font-medium">Form field and select</h2>
      <DsField label="Reference" hint="As printed on the waybill" required v-slot="{ id, describedBy }">
        <input :id="id" :aria-describedby="describedBy" class="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" />
      </DsField>
      <DsField label="Weight (kg)" error="Enter a number greater than zero" v-slot="{ id, describedBy, invalid }">
        <input :id="id" :aria-describedby="describedBy" :aria-invalid="invalid || undefined" value="-3" class="rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--surface)] px-3 py-2 text-[var(--fg)]" />
      </DsField>
      <DsSelect v-model="country" label="Country" :options="countries" placeholder="Choose a country" />
    </section>

    <section aria-labelledby="h-data" class="flex flex-col gap-4">
      <h2 id="h-data" class="text-lg font-medium">Data regions — the five states</h2>
      <div v-for="[name, view] in views" :key="name" class="flex flex-col gap-2" :data-view-state="name">
        <h3 class="text-sm font-medium text-[var(--fg-muted)]">{{ name }}</h3>
        <DsDataRegion :view="view" :label="`Shipments (${name})`" v-slot="{ rows: r }">
          <div class="overflow-x-auto"><table class="w-full text-sm">
            <caption class="sr-only">Shipments ({{ name }})</caption>
            <thead><tr class="text-left text-[var(--fg-muted)]"><th scope="col" class="py-1">Id</th><th scope="col">Customer</th><th scope="col">Status</th></tr></thead>
            <tbody><tr v-for="row in r" :key="row.id" class="border-t border-[var(--border)]"><td class="py-1 font-[family-name:var(--font-mono)]">{{ row.id }}</td><td>{{ row.customer }}</td><td><DsStatusBadge :tone="toneOf(row.status)">{{ row.status }}</DsStatusBadge></td></tr></tbody>
          </table></div>
        </DsDataRegion>
      </div>
      <DsEmptyState title="No drivers assigned" help="Assign a driver to see the route here."><DsButton tone="secondary">Assign driver</DsButton></DsEmptyState>
    </section>

    <section aria-labelledby="h-kpi" class="flex flex-col gap-3">
      <h2 id="h-kpi" class="text-lg font-medium">KPIs and status</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <DsKpi label="On-time deliveries" value="97.2%" :delta="{ direction: 'up', text: '+1.4 pts vs last week' }" />
        <DsKpi label="Open incidents" value="12" :delta="{ direction: 'down', text: '−3 vs last week' }" />
        <DsKpi label="Active drivers" value="48" :delta="{ direction: 'flat', text: 'unchanged' }" />
      </div>
      <div class="flex flex-wrap gap-2">
        <DsStatusBadge>Neutral</DsStatusBadge><DsStatusBadge tone="info">In transit</DsStatusBadge><DsStatusBadge tone="success">Delivered</DsStatusBadge><DsStatusBadge tone="warning">Delayed</DsStatusBadge><DsStatusBadge tone="danger">Failed</DsStatusBadge>
      </div>
    </section>

    <section aria-labelledby="h-dialog" class="flex flex-col gap-3">
      <h2 id="h-dialog" class="text-lg font-medium">Dialog</h2>
      <div><DsButton tone="secondary" @click="dialogOpen = true">Open dialog</DsButton></div>
      <DsDialog v-model:open="dialogOpen" title="Edit shipment" description="Changes apply on save.">
        <p class="text-[var(--fg)]">Dialog body.</p>
      </DsDialog>
    </section>
  </main>
</template>
