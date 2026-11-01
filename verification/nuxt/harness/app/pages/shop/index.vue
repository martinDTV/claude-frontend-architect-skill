<script setup lang="ts">
// The catalogue: the rail (or the filter sheet) edits the URL, the shelf renders it; a strict card grid, the count line
// and the active filters as removable chips; sorting and paging through the URL as well. The rail and the grid answer
// to container widths in rem, so a larger text size drops columns the way a narrower screen does.
import { activeFilterCount, AVAILABILITY_LABEL, FORM_LABEL, GLAZES, MAKERS, type SortKey } from '~/lib/ui/shop/catalog'

definePageMeta({ layout: 'shop' })
useHead({ title: 'Studio ceramics by named makers' })
const { state, result, set, toggle, clear } = useCatalogState()
const filtersOpen = ref(false)
const sortItems: { label: string; value: SortKey }[] = [{ label: 'Featured', value: 'featured' }, { label: 'Price, low to high', value: 'price-asc' }, { label: 'Price, high to low', value: 'price-desc' }, { label: 'Name' , value: 'name' }]
const sort = computed({ get: () => state.value.sort, set: (v: SortKey) => set({ sort: v }) })
const page = computed({ get: () => result.value.page, set: (v: number) => set({ page: v }, { keepPage: true }) })
const chips = computed(() => [
  ...state.value.makers.map((m) => ({ key: 'makers' as const, value: m, label: MAKERS.find((x) => x.id === m)?.name ?? m })),
  ...state.value.forms.map((f) => ({ key: 'forms' as const, value: f, label: FORM_LABEL[f] })),
  ...state.value.glazes.map((g) => ({ key: 'glazes' as const, value: g, label: GLAZES.find((x) => x.id === g)?.name ?? g })),
  ...state.value.availability.map((a) => ({ key: 'availability' as const, value: a, label: AVAILABILITY_LABEL[a] })),
])
const active = computed(() => activeFilterCount(state.value))
</script>

<template>
  <main id="main" class="@container mx-auto max-w-(--container-page) px-(--gutter) py-8" tabindex="-1">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-serif text-3xl tracking-tight">Studio ceramics by named makers</h1>
        <p class="mt-1 max-w-xl text-sm text-fg-muted">Small runs, real stock. Filter by maker, form, glaze and availability; prices include tax.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton label="Filters" icon="i-lucide-sliders-horizontal" color="neutral" variant="outline" class="@5xl:hidden" :aria-label="active ? `Filters, ${active} active` : 'Filters'" data-filters-button @click="filtersOpen = true"><template v-if="active" #trailing><UBadge color="primary" size="sm" class="rounded-full">{{ active }}</UBadge></template></UButton>
        <label class="flex min-w-0 basis-full flex-col items-start gap-1 text-sm sm:basis-auto sm:flex-row sm:items-center sm:gap-2"><span class="text-fg-muted">Sort</span><USelect v-model="sort" :items="sortItems" value-key="value" class="w-full min-w-0 sm:w-44" aria-label="Sort pieces" data-sort /></label>
      </div>
    </div>
    <div class="grid grid-cols-1 gap-8 @5xl:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
      <aside class="hidden @5xl:block" aria-label="Filters">
        <div class="sticky top-6"><ShopFilterRail :state="state" :counts="{ total: result.total }" @toggle="toggle" @clear="clear" /></div>
      </aside>
      <section aria-labelledby="shelf" class="@container min-w-0">
        <h2 id="shelf" class="sr-only">Pieces</h2>
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <p class="text-sm text-fg-muted tabular-nums" aria-live="polite" data-results-count>{{ result.total }} piece{{ result.total === 1 ? '' : 's' }}<template v-if="state.search"> for “{{ state.search }}”</template></p>
          <ul v-if="chips.length || state.search" class="flex flex-wrap gap-1.5" aria-label="Active filters">
            <li v-for="c in chips" :key="`${c.key}:${c.value}`"><UButton :label="c.label" trailing-icon="i-lucide-x" size="xs" color="primary" variant="soft" class="rounded-full" :aria-label="`Remove filter ${c.label}`" :data-chip="`${c.key}:${c.value}`" @click="toggle(c.key, c.value as never)" /></li>
            <li v-if="state.search"><UButton :label="`“${state.search}”`" trailing-icon="i-lucide-x" size="xs" color="primary" variant="soft" class="rounded-full" aria-label="Clear the search" @click="set({ search: '' })" /></li>
          </ul>
        </div>
        <div v-if="result.total === 0" class="rounded-md border border-dashed border-border p-10 text-center" data-no-match>
          <p class="font-serif text-lg">Nothing on this shelf</p>
          <p class="mt-1 text-sm text-fg-muted">Widen the filters or clear the search; made-to-order pieces are hidden when availability is filtered to stock.</p>
          <UButton label="Clear all filters" color="neutral" variant="outline" class="mt-4" @click="clear" />
        </div>
        <ul v-else class="grid grid-cols-1 gap-(--gutter) @[18rem]:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4" aria-label="Pieces" data-shelf>
          <ShopPieceCard v-for="p in result.rows" :key="p.id" :piece="p" />
        </ul>
        <nav v-if="result.pages > 1" class="mt-8 flex justify-center" aria-label="Pagination">
          <UPagination v-model:page="page" :total="result.total" :items-per-page="state.pageSize" :sibling-count="1" show-edges :ui="{ list: 'flex-wrap justify-center' }" data-pagination />
        </nav>
      </section>
    </div>
    <USlideover v-model:open="filtersOpen" title="Filters" :description="`${result.total} piece${result.total === 1 ? '' : 's'} match`" side="left" :ui="{ footer: 'justify-end' }">
      <template #body><ShopFilterRail :state="state" :counts="{ total: result.total }" :heading="false" @toggle="toggle" @clear="clear" /></template>
      <template #footer="{ close }"><UButton :label="`Show ${result.total} piece${result.total === 1 ? '' : 's'}`" color="primary" data-filters-apply @click="close" /></template>
    </USlideover>
  </main>
</template>
