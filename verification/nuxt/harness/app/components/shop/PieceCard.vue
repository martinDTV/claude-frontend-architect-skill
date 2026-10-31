<script setup lang="ts">
// A card on the shelf (R7: a strict grid, four short lines, prices in tabular figures): the photograph of the best
// variant, the name, the maker in the serif, the price or price range, the availability in words.
import { fmtPrice, makerOf, pieceAvailability, priceRange, type Piece } from '~/lib/ui/shop/catalog'

const props = defineProps<{ piece: Piece }>()
const variant = computed(() => props.piece.variants.find((v) => v.stock > 0) ?? props.piece.variants[0]!)
const range = computed(() => priceRange(props.piece))
const availability = computed(() => pieceAvailability(props.piece))
</script>

<template>
  <li class="group rounded-md border border-border bg-surface p-3 transition-colors hover:border-border-strong focus-within:border-border-strong" :data-piece="piece.id" :data-availability="availability">
    <NuxtLink :to="`/shop/${piece.slug}`" class="block focus-visible:outline-none">
      <div class="aspect-[4/5] overflow-hidden rounded-md bg-[#f3efe8]"><ShopPieceArt :piece="piece" :variant="variant" size="card" /></div>
      <p class="mt-3 text-sm font-medium leading-snug">{{ piece.name }}<span v-if="piece.variants.length > 1" class="text-fg-muted"> · {{ piece.variants.length }} variants</span></p>
    </NuxtLink>
    <p class="font-serif text-sm text-fg-muted">{{ makerOf(piece).name }}</p>
    <p class="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
      <span class="tabular-nums font-medium" data-price>{{ range[0] === range[1] ? fmtPrice(range[0]) : `${fmtPrice(range[0])}–${fmtPrice(range[1])}` }}</span>
      <ShopAvailabilityBadge :value="availability" />
    </p>
  </li>
</template>
