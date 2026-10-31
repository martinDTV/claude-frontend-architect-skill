<script setup lang="ts">
// The piece's "photograph": a procedural render of the form in its glaze on the studio surface, in a fixed 4:5 box so
// the grid never shifts (the contract's imagery policy). The surface stays light in the dark theme (photographs are
// untouched). role="img" with the alt the contract asks for: piece, maker, glaze.
import { artFor, type Piece, type Variant } from '~/lib/ui/shop/catalog'

const props = defineProps<{ piece: Piece; variant: Variant; size?: 'card' | 'hero' | 'thumb' }>()
const art = computed(() => artFor(props.piece, props.variant))
const id = useId()
const shape = computed(() => {
  switch (props.piece.form) {
    case 'bowl': return 'M70 230 Q200 420 330 230 Z'
    case 'cup': return 'M110 240 Q200 380 290 240 Z'
    case 'plate': return 'M50 290 Q200 230 350 290 Q200 350 50 290 Z'
    case 'mug': return 'M110 180 H270 V360 Q270 380 250 380 H130 Q110 380 110 360 Z'
    case 'vase': return 'M160 130 H240 Q250 180 300 220 Q320 320 270 380 H130 Q80 320 100 220 Q150 180 160 130 Z'
    case 'jug': return 'M140 160 H250 L300 130 L285 200 Q310 300 270 380 H130 Q90 300 115 200 Z'
  }
})
const rim = computed(() => (props.piece.form === 'bowl' ? 'M70 230 Q200 170 330 230' : props.piece.form === 'cup' ? 'M110 240 Q200 200 290 240' : null))
</script>

<template>
  <svg viewBox="0 0 400 500" class="block h-auto w-full" :class="size === 'thumb' ? 'rounded-sm' : 'rounded-md'" role="img" :aria-label="art.label" data-art :data-glaze="variant.glazeId">
    <defs>
      <linearGradient :id="`${id}-light`" x1="0" x2="1" y1="0" y2="0.3">
        <stop offset="0" :stop-color="art.highlight" />
        <stop offset="0.55" stop-color="rgba(255,255,255,0)" />
        <stop offset="1" stop-color="rgba(0,0,0,0.22)" />
      </linearGradient>
      <radialGradient :id="`${id}-shadow`" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="rgba(60,40,30,0.28)" />
        <stop offset="1" stop-color="rgba(60,40,30,0)" />
      </radialGradient>
    </defs>
    <rect width="400" height="500" :fill="art.background" />
    <rect y="330" width="400" height="170" fill="rgba(0,0,0,0.035)" />
    <ellipse cx="215" cy="395" rx="150" ry="28" :fill="`url(#${id}-shadow)`" />
    <path :d="shape" :fill="art.glaze" />
    <path :d="shape" :fill="`url(#${id}-light)`" />
    <path v-if="rim" :d="rim" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="3" />
    <path v-if="piece.form === 'mug'" d="M270 220 Q340 220 340 280 Q340 340 270 340" fill="none" :stroke="art.glaze" stroke-width="22" stroke-linecap="round" />
    <path v-if="piece.form === 'mug'" d="M270 220 Q340 220 340 280 Q340 340 270 340" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="6" stroke-linecap="round" />
  </svg>
</template>
