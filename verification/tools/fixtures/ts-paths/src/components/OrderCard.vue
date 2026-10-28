<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import type { Order } from '#core/orders'
import { checkoutTotal } from '@/features/checkout/total'
import StatusBadge from './StatusBadge.vue'
const props = defineProps<{ order: Order }>()
const emit = defineEmits<{ paid: [id: string] }>()
const expanded = ref(false)
const total = computed(() => checkoutTotal(props.order))
function onResize() {
  expanded.value = window.innerWidth > 800
}
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
</script>
<template>
  <article>
    <StatusBadge :status="order.id ? 'paid' : 'draft'" />
    <p v-if="expanded">{{ total }}</p>
    <button type="button" @click="emit('paid', order.id)">Pay</button>
  </article>
</template>
