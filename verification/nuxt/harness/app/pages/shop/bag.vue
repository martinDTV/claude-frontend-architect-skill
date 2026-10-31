<script setup lang="ts">
// The bag reviewed on its own page: the lines as a table, totals, delivery and the made-to-order note, and an honest
// end: this reference takes no payment, so the last step says so instead of pretending.
import { CATALOG, fmtPrice, glazeOf } from '~/lib/ui/shop/catalog'
import { resolveLine } from '~/lib/ui/shop/cart'

definePageMeta({ layout: 'shop' })
useHead({ title: 'Your bag' })
const { cart, totals, dispatch, loaded } = useBag()
const lines = computed(() => cart.value.lines.map((l) => ({ line: l, ...resolveLine(l, CATALOG)! })).filter((x) => x.piece))
</script>

<template>
  <main id="main" class="mx-auto max-w-(--container-page) px-(--gutter) py-8" tabindex="-1">
    <h1 class="font-serif text-3xl tracking-tight">Your bag</h1>
    <ClientOnly>
      <p v-if="!lines.length" class="mt-6 rounded-md border border-dashed border-border p-4 text-center sm:p-10" data-bag-empty>
        <span class="block font-serif text-lg">Nothing in your bag</span>
        <span class="mt-1 block text-sm text-fg-muted">Pieces you add stay on this device until you remove them.</span>
        <UButton to="/shop" label="Browse the shelf" color="primary" class="mt-4 max-w-full" :ui="{ base: 'whitespace-normal h-auto' }" />
      </p>
      <div v-else class="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_20rem]" data-bag-summary>
        <table class="w-full text-sm">
          <caption class="sr-only">Lines in your bag</caption>
          <thead><tr class="border-b border-border text-left text-xs uppercase tracking-wide text-fg-muted"><th scope="col" class="py-2 font-medium">Piece</th><th scope="col" class="py-2 font-medium">Each</th><th scope="col" class="py-2 font-medium">Quantity</th><th scope="col" class="py-2 text-right font-medium">Total</th></tr></thead>
          <tbody>
            <tr v-for="{ line, piece, variant } in lines" :key="`${line.pieceId}/${line.variantId}`" class="border-b border-border" data-bag-line>
              <td class="py-3"><div class="flex items-center gap-3"><span class="w-12 shrink-0 overflow-hidden rounded-sm"><ShopPieceArt :piece="piece" :variant="variant" size="thumb" /></span><span><NuxtLink :to="`/shop/${piece.slug}`" class="font-medium hover:underline">{{ piece.name }}</NuxtLink><span class="block text-xs text-fg-muted">{{ glazeOf(variant).name }} · {{ variant.size }}</span></span></div></td>
              <td class="py-3 tabular-nums">{{ fmtPrice(variant.priceCents) }}</td>
              <td class="py-3 tabular-nums">{{ line.quantity }} <UButton label="Remove" variant="link" color="neutral" size="xs" data-remove @click="dispatch({ type: 'remove', pieceId: piece.id, variantId: variant.id })" /></td>
              <td class="py-3 text-right tabular-nums">{{ fmtPrice(line.quantity * variant.priceCents) }}</td>
            </tr>
          </tbody>
        </table>
        <aside class="rounded-md border border-border bg-surface p-4" aria-label="Summary">
          <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular-nums">
            <dt class="text-fg-muted">Subtotal</dt><dd>{{ fmtPrice(totals.subtotalCents) }}</dd>
            <dt class="text-fg-muted">Delivery</dt><dd>{{ totals.shippingCents ? fmtPrice(totals.shippingCents) : 'Free' }}</dd>
            <dt class="mt-2 font-semibold">Total</dt><dd class="mt-2 font-semibold" data-bag-total>{{ fmtPrice(totals.totalCents) }}</dd>
          </dl>
          <p v-if="totals.madeToOrder" class="mt-3 text-xs text-fg-muted">{{ totals.madeToOrder }} made-to-order piece{{ totals.madeToOrder === 1 ? '' : 's' }} ship in 4 to 6 weeks; the rest within two working days.</p>
          <UButton label="Continue to delivery" color="primary" block class="mt-4" disabled aria-describedby="no-checkout" />
          <p id="no-checkout" class="mt-2 text-xs text-fg-muted">Checkout is outside this reference: no address or payment is collected anywhere on this site.</p>
          <UButton label="Empty the bag" color="neutral" variant="ghost" block class="mt-2" data-clear-bag @click="dispatch({ type: 'clear' })" />
        </aside>
      </div>
      <template #fallback><p class="mt-6 text-sm text-fg-muted" role="status">Loading your bag…</p></template>
    </ClientOnly>
    <p v-if="!loaded" class="sr-only">Bag loads on this device.</p>
  </main>
</template>
