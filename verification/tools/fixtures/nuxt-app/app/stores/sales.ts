import { defineStore } from 'pinia'
import type { Lead } from '~/types/sales'
export const useSalesStore = defineStore('sales', () => {
  const leads = ref<Lead[]>([])
  const filtro = ref('')
  return { leads, filtro }
})
