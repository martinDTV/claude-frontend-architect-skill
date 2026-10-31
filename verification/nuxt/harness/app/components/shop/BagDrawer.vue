<script setup lang="ts">
// The bag as a drawer (R5): reachable from anywhere, a dialog with focus trapped and restored by the slideover, lines
// with quantity steppers capped by stock, totals, and the way to the summary page. No payment anywhere.
import { CATALOG, fmtPrice, glazeOf } from '~/lib/ui/shop/catalog'
import { maxQuantity, resolveLine } from '~/lib/ui/shop/cart'

const { cart, totals, open, dispatch } = useBag()
const lines = computed(() => cart.value.lines.map((l) => ({ line: l, ...resolveLine(l, CATALOG)! })).filter((x) => x.piece))
</script>

<template>
  <USlideover v-model:open="open" title="Your bag" :description="totals.count ? `${totals.count} item${totals.count === 1 ? '' : 's'}` : 'Nothing in it yet'" :ui="{ footer: 'flex-col items-stretch gap-3' }">
    <template #body>
      <div data-bag-drawer>
        <p v-if="!lines.length" class="rounded-md border border-dashed border-border p-6 text-center text-sm text-fg-muted" data-bag-empty>Your bag is empty. Pieces you add stay here on this device.</p>
        <ul v-else class="divide-y divide-border" aria-label="Bag lines">
          <li v-for="{ line, piece, variant } in lines" :key="`${line.pieceId}/${line.variantId}`" class="flex gap-3 py-3" data-bag-line :data-piece="piece.id" :data-variant="variant.id">
            <NuxtLink :to="`/shop/${piece.slug}`" class="w-16 shrink-0 overflow-hidden rounded-sm" @click="open = false"><ShopPieceArt :piece="piece" :variant="variant" size="thumb" /></NuxtLink>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium leading-snug">{{ piece.name }}</p>
              <p class="text-xs text-fg-muted">{{ glazeOf(variant).name }} · {{ variant.size }} · {{ fmtPrice(variant.priceCents) }} each</p>
              <div class="mt-2 flex items-center gap-2">
                <div class="inline-flex items-center rounded-md border border-border" role="group" :aria-label="`Quantity of ${piece.name}`">
                  <UButton icon="i-lucide-minus" variant="ghost" color="neutral" size="xs" :aria-label="`One fewer ${piece.name}`" data-qty-dec @click="dispatch({ type: 'set', pieceId: piece.id, variantId: variant.id, quantity: line.quantity - 1 })" />
                  <span class="min-w-6 text-center text-sm tabular-nums" data-qty aria-live="polite">{{ line.quantity }}</span>
                  <UButton icon="i-lucide-plus" variant="ghost" color="neutral" size="xs" :aria-label="`One more ${piece.name}`" :disabled="line.quantity >= maxQuantity(variant)" data-qty-inc @click="dispatch({ type: 'set', pieceId: piece.id, variantId: variant.id, quantity: line.quantity + 1 })" />
                </div>
                <span v-if="line.quantity >= maxQuantity(variant)" class="text-xs text-fg-muted">{{ variant.stock > 0 ? `Only ${variant.stock} in stock` : 'Made to order, 12 at most' }}</span>
                <UButton label="Remove" variant="link" color="neutral" size="xs" class="ms-auto" data-remove @click="dispatch({ type: 'remove', pieceId: piece.id, variantId: variant.id })" />
              </div>
            </div>
            <p class="text-sm font-medium tabular-nums">{{ fmtPrice(line.quantity * variant.priceCents) }}</p>
          </li>
        </ul>
      </div>
    </template>
    <template #footer="{ close }">
      <dl v-if="lines.length" class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular-nums">
        <dt class="text-fg-muted">Subtotal</dt><dd data-bag-subtotal>{{ fmtPrice(totals.subtotalCents) }}</dd>
        <dt class="text-fg-muted">Delivery</dt><dd>{{ totals.shippingCents ? fmtPrice(totals.shippingCents) : 'Free' }}</dd>
        <dt class="font-semibold">Total</dt><dd class="font-semibold" data-bag-total>{{ fmtPrice(totals.totalCents) }}</dd>
      </dl>
      <p v-if="totals.madeToOrder" class="text-xs text-fg-muted">{{ totals.madeToOrder }} made-to-order piece{{ totals.madeToOrder === 1 ? '' : 's' }}: 4 to 6 weeks.</p>
      <div class="flex gap-2">
        <UButton label="Keep browsing" color="neutral" variant="ghost" class="flex-1 justify-center" @click="close" />
        <UButton to="/shop/bag" label="Review bag" color="primary" class="flex-1 justify-center" :disabled="!lines.length" data-review-bag @click="open = false" />
      </div>
    </template>
  </USlideover>
</template>
