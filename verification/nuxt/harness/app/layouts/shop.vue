<script setup lang="ts">
// Ember & Ash (ember-store contract, commerce-ui.md): the storefront frame. A quiet header (wordmark in the serif,
// search, the bag with its count, the theme switch), the bag drawer reachable from every page, a skip link, and the
// contract's tokens scoped to this area of the app ([data-contract="ember"]).
const { totals, open } = useBag()
const route = useRoute()
const router = useRouter()
const search = ref(String(route.query.q ?? ''))
watch(() => route.query.q, (q) => { search.value = String(q ?? '') })
function submitSearch() {
  router.push({ path: '/shop', query: { ...(route.path === '/shop' ? route.query : {}), q: search.value || undefined, page: undefined } })
}
</script>

<template>
  <div data-contract="ember" class="min-h-screen bg-canvas text-fg">
    <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-fg">Skip to content</a>
    <!-- four groups placed by grid areas: wordmark and actions on the first row, the navigation, then the search on a
         phone; navigation beside the wordmark from 48rem; one row from 64rem (container units follow the text size) -->
    <header class="shop-header border-b border-border bg-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-canvas/80">
      <div class="shop-header-grid mx-auto grid max-w-(--container-page) items-center gap-x-6 gap-y-2 px-(--gutter) py-3">
        <NuxtLink to="/shop" class="shop-brand font-serif text-xl font-semibold tracking-tight" aria-label="Ember & Ash, shop home">Ember <span aria-hidden="true">&amp;</span><span class="sr-only">and</span> Ash</NuxtLink>
        <nav aria-label="Shop" class="shop-nav flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <NuxtLink to="/shop" class="whitespace-nowrap hover:underline" :aria-current="route.path === '/shop' ? 'page' : undefined">All pieces</NuxtLink>
          <NuxtLink to="/shop?availability=last-few" class="whitespace-nowrap hover:underline">Last few</NuxtLink>
          <NuxtLink to="/shop/bag" class="whitespace-nowrap hover:underline" :aria-current="route.path === '/shop/bag' ? 'page' : undefined">Bag</NuxtLink>
        </nav>
        <form class="shop-search flex w-full items-center gap-2" role="search" @submit.prevent="submitSearch">
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search pieces, makers, glazes" aria-label="Search the shop" class="w-full @5xl:w-64" data-search />
          <UButton type="submit" label="Search" color="neutral" variant="outline" />
        </form>
        <div class="shop-actions flex items-center justify-end gap-2">
          <UColorModeButton aria-label="Toggle colour theme" />
          <UButton color="neutral" variant="outline" icon="i-lucide-shopping-bag" :aria-label="`Bag, ${totals.count} item${totals.count === 1 ? '' : 's'}`" data-bag-button @click="open = true">
            <span :key="totals.count" class="bag-count min-w-5 rounded-full bg-accent px-1.5 text-center text-xs font-semibold tabular-nums text-accent-fg" data-bag-count>{{ totals.count }}</span>
          </UButton>
        </div>
      </div>
    </header>
    <slot />
    <footer class="mt-16 border-t border-border">
      <div class="mx-auto flex max-w-(--container-page) flex-wrap justify-between gap-4 px-(--gutter) py-8 text-sm text-fg-muted">
        <p>Ember <span aria-hidden="true">&amp;</span><span class="sr-only">and</span> Ash · studio ceramics by named makers. A fictional shop built for the frontend-architect verification; nothing is sold here.</p>
        <p class="tabular-nums">Free delivery from €120 · returns within 30 days</p>
      </div>
    </footer>
    <ShopBagDrawer />
  </div>
</template>

<style scoped>
/* the header's grid areas; the queries are on the header's own width, in rem */
.shop-header { container-type: inline-size; }
.shop-header-grid { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'brand actions' 'nav nav' 'search search'; }
.shop-brand { grid-area: brand; }
.shop-nav { grid-area: nav; }
.shop-search { grid-area: search; }
.shop-actions { grid-area: actions; }
@container (min-width: 48rem) {
  .shop-header-grid { grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: 'brand nav actions' 'search search search'; }
}
@container (min-width: 64rem) {
  .shop-header-grid { grid-template-columns: auto auto minmax(0, 1fr) auto; grid-template-areas: 'brand nav search actions'; }
  .shop-search { justify-self: end; width: auto; }
}
/* the bag count bumps once when it changes (the contract's motion: feedback only); reduced motion cuts it globally */
@keyframes bag-bump { 0% { transform: scale(1); } 40% { transform: scale(1.3); } 100% { transform: scale(1); } }
.bag-count { display: inline-block; animation: bag-bump var(--duration-fast) var(--ease-standard) 1; }
</style>
