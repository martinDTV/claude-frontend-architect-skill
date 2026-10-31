<script setup lang="ts">
// Variants are never ambiguous (R4): glaze as radio swatches with visible labels, size as radio buttons; the chosen one
// carries a 2px accent ring; combinations that do not exist are not offered.
import { glazeOf, GLAZES, SIZES, type Piece } from '~/lib/ui/shop/catalog'

const props = defineProps<{ piece: Piece; glazeId: string; size: string }>()
const emit = defineEmits<{ 'update:glazeId': [id: string]; 'update:size': [size: string] }>()
const glazes = computed(() => GLAZES.filter((g) => props.piece.variants.some((v) => v.glazeId === g.id)))
const sizesFor = (glazeId: string) => SIZES.filter((s) => props.piece.variants.some((v) => v.glazeId === glazeId && v.size === s))
const glazeName = computed(() => glazeOf(props.piece.variants.find((v) => v.glazeId === props.glazeId)!).name)
const sizes = computed(() => sizesFor(props.glazeId))
function pickGlaze(id: string) {
  emit('update:glazeId', id)
  if (!sizesFor(id).includes(props.size as 'S' | 'M' | 'L')) emit('update:size', sizesFor(id)[0] ?? 'M')
}
</script>

<template>
  <div class="space-y-4">
    <fieldset>
      <legend class="mb-2 text-sm font-semibold">Glaze <span class="font-normal text-fg-muted">· {{ glazeName }}</span></legend>
      <div class="flex flex-wrap gap-2">
        <label v-for="g in glazes" :key="g.id" class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:ring-2 has-[:checked]:ring-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus)">
          <input type="radio" name="glaze" :value="g.id" :checked="g.id === glazeId" class="sr-only" :data-variant-glaze="g.id" @change="pickGlaze(g.id)" />
          <span class="inline-block size-4 rounded-full border border-border-strong" :style="{ background: g.hex }" aria-hidden="true" />{{ g.name }}
        </label>
      </div>
    </fieldset>
    <fieldset>
      <legend class="mb-2 text-sm font-semibold">Size <span class="font-normal text-fg-muted">· {{ piece.dimensions[size as 'S' | 'M' | 'L'] }}</span></legend>
      <div class="flex flex-wrap gap-2">
        <label v-for="s in sizes" :key="s" class="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-border px-3 text-sm has-[:checked]:border-accent has-[:checked]:ring-2 has-[:checked]:ring-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus)">
          <input type="radio" name="size" :value="s" :checked="s === size" class="sr-only" :data-variant-size="s" @change="emit('update:size', s)" />{{ s }}
        </label>
      </div>
    </fieldset>
  </div>
</template>
