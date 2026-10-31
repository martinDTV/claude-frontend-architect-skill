<script setup lang="ts">
// Product detail: the gallery on the left two thirds (the chosen variant large, the other glazes as thumbnails that
// are buttons), a sticky purchase panel on the right (price, availability, variants, quantity, add to bag); under 768px
// the panel becomes a sticky bottom bar with the price and the action. The variant lives in the URL (?glaze=&size=).
import { availability, AVAILABILITY_LABEL, canBuy, CATALOG, fmtPrice, glazeOf, GLAZES, makerOf, type Piece, type Variant } from '~/lib/ui/shop/catalog'
import { maxQuantity } from '~/lib/ui/shop/cart'

definePageMeta({ layout: 'shop' })
const route = useRoute()
const router = useRouter()
const found = CATALOG.find((p) => p.slug === route.params.slug)
if (!found) throw createError({ statusCode: 404, statusMessage: 'Piece not found', fatal: true })
const piece: Piece = found
const maker = makerOf(piece)
useHead({ title: `${piece.name} by ${maker.name}` })
const first = piece.variants.find((v) => v.stock > 0) ?? piece.variants[0]!
const glazeId = computed({ get: () => (piece.variants.some((v) => v.glazeId === route.query.glaze) ? String(route.query.glaze) : first.glazeId), set: (g: string) => router.replace({ query: { ...route.query, glaze: g } }) })
const size = computed({ get: () => { const s = String(route.query.size ?? ''); return piece.variants.some((v) => v.glazeId === glazeId.value && v.size === s) ? s : (piece.variants.find((v) => v.glazeId === glazeId.value)?.size ?? 'M') }, set: (s: string) => router.replace({ query: { ...route.query, size: s } }) })
const variant = computed<Variant>(() => piece.variants.find((v) => v.glazeId === glazeId.value && v.size === size.value) ?? piece.variants.find((v) => v.glazeId === glazeId.value) ?? first)
const state = computed(() => availability(variant.value))
const qty = ref(1)
watch(variant, () => { qty.value = Math.min(Math.max(1, qty.value), Math.max(1, maxQuantity(variant.value))) })
const thumbs = computed(() => GLAZES.filter((g) => piece.variants.some((v) => v.glazeId === g.id)).map((g) => ({ glaze: g, variant: piece.variants.find((v) => v.glazeId === g.id)! })))
const { dispatch, open } = useBag()
const toast = useToast()
const added = ref<string | null>(null)
function add() {
  if (!canBuy(variant.value)) return
  const ok = dispatch({ type: 'add', pieceId: piece.id, variantId: variant.value.id, quantity: qty.value })
  if (!ok) return
  added.value = `${qty.value} × ${piece.name}, ${glazeOf(variant.value).name} ${variant.value.size}, added to your bag.`
  toast.add({ title: 'Added to your bag', description: `${piece.name} · ${glazeOf(variant.value).name} · ${variant.value.size}`, color: 'success', icon: 'i-lucide-shopping-bag', actions: [{ label: 'Open bag', color: 'neutral', variant: 'outline', onClick: () => { open.value = true } }] })
}
</script>

<template>
  <main id="main" class="mx-auto max-w-(--container-page) px-(--gutter) py-8 pb-28 md:pb-8" tabindex="-1">
    <nav aria-label="Breadcrumb" class="mb-4 text-sm text-fg-muted"><ol class="flex flex-wrap gap-1"><li><NuxtLink to="/shop" class="hover:underline">All pieces</NuxtLink></li><li aria-hidden="true">/</li><li><NuxtLink :to="`/shop?form=${piece.form}`" class="capitalize hover:underline">{{ piece.form }}s</NuxtLink></li><li aria-hidden="true">/</li><li aria-current="page">{{ piece.name }}</li></ol></nav>
    <div class="grid grid-cols-1 gap-8 md:grid-cols-[2fr_1fr]">
      <section aria-label="Photographs" data-gallery>
        <div class="aspect-[4/5] overflow-hidden rounded-md">
          <Transition name="art" mode="out-in"><ShopPieceArt :key="variant.glazeId" :piece="piece" :variant="variant" size="hero" /></Transition>
        </div>
        <ul v-if="thumbs.length > 1" class="mt-3 flex flex-wrap gap-2" aria-label="Glazes">
          <li v-for="t in thumbs" :key="t.glaze.id">
            <button type="button" class="block w-16 overflow-hidden rounded-sm border-2 transition-colors" :class="t.glaze.id === glazeId ? 'border-accent' : 'border-transparent hover:border-border-strong'" :aria-label="`Show the ${t.glaze.name} glaze`" :aria-pressed="t.glaze.id === glazeId" :data-thumb="t.glaze.id" @click="glazeId = t.glaze.id"><ShopPieceArt :piece="piece" :variant="t.variant" size="thumb" /></button>
          </li>
        </ul>
        <div class="prose-sm mt-8 max-w-prose text-fg">
          <h2 class="font-serif text-xl">About this piece</h2>
          <p class="mt-2">{{ piece.description }}</p>
          <h3 class="mt-4 font-semibold">Care</h3>
          <p class="mt-1 text-fg-muted">{{ piece.care }}</p>
          <h3 class="mt-4 font-semibold">The maker</h3>
          <p class="mt-1 text-fg-muted"><span class="font-serif text-fg">{{ maker.name }}</span> · {{ maker.studio }}. {{ maker.bio }}</p>
        </div>
      </section>
      <aside class="md:sticky md:top-6 md:self-start" aria-label="Buy" data-purchase-panel>
        <p class="font-serif text-sm text-fg-muted">{{ maker.name }}</p>
        <h1 class="text-2xl font-medium tracking-tight">{{ piece.name }}</h1>
        <p class="mt-2 flex items-baseline justify-between gap-3">
          <span class="text-xl font-semibold tabular-nums" data-price>{{ fmtPrice(variant.priceCents) }}</span>
          <ShopAvailabilityBadge :value="state" />
        </p>
        <p class="mt-1 text-xs text-fg-muted" data-stock-note>
          <template v-if="state === 'last-few'">Only {{ variant.stock }} left in this glaze and size.</template>
          <template v-else-if="state === 'made-to-order'">Thrown for you: 4 to 6 weeks.</template>
          <template v-else-if="state === 'sold-out'">This glaze and size is gone; another glaze may be in stock.</template>
          <template v-else>Ships within two working days.</template>
        </p>
        <div class="mt-5"><ShopVariantPicker :piece="piece" v-model:glaze-id="glazeId" v-model:size="size" /></div>
        <form class="mt-5 hidden items-end gap-3 md:flex" novalidate @submit.prevent="add">
          <UFormField label="Quantity" name="qty"><UInput v-model.number="qty" type="number" inputmode="numeric" min="1" :max="Math.max(1, maxQuantity(variant))" class="w-20" :disabled="!canBuy(variant)" data-qty-input /></UFormField>
          <UButton type="submit" :label="canBuy(variant) ? 'Add to bag' : AVAILABILITY_LABEL[state]" color="primary" size="lg" class="flex-1 justify-center" :disabled="!canBuy(variant)" data-add />
        </form>
        <p class="sr-only" role="status" aria-live="polite" data-added>{{ added }}</p>
        <dl class="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="text-fg-muted">Size</dt><dd>{{ piece.dimensions[variant.size] }}</dd>
          <dt class="text-fg-muted">Glaze</dt><dd>{{ glazeOf(variant).name }}</dd>
          <dt class="text-fg-muted">Delivery</dt><dd>Free from €120; €9 below</dd>
        </dl>
      </aside>
    </div>
    <!-- the sticky bar on phones: the price and the action, never over focused controls (the page keeps a bottom padding) -->
    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-canvas/95 p-3 backdrop-blur md:hidden" data-sticky-buy>
      <div class="mx-auto flex max-w-(--container-page) items-center gap-3">
        <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium">{{ piece.name }} · {{ glazeOf(variant).name }} {{ variant.size }}</p><p class="text-sm tabular-nums text-fg-muted">{{ fmtPrice(variant.priceCents) }} · {{ AVAILABILITY_LABEL[state] }}</p></div>
        <UButton :label="canBuy(variant) ? 'Add to bag' : AVAILABILITY_LABEL[state]" color="primary" size="lg" class="min-h-11" :disabled="!canBuy(variant)" data-add-mobile @click="add" />
      </div>
    </div>
  </main>
</template>

<style scoped>
/* the 320 ms crossfade when a variant changes the photograph; reduced motion cuts it globally */
.art-enter-active, .art-leave-active { transition: opacity var(--duration-slow) var(--ease-standard); }
.art-enter-from, .art-leave-to { opacity: 0; }
</style>
