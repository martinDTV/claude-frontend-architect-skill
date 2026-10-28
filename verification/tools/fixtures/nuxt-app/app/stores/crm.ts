import { defineStore } from 'pinia'
import type { Oportunidad } from '~/types/crm'
export const useCrmStore = defineStore('crm', () => {
  const oportunidades = ref<Oportunidad[]>([])
  const filtro = ref('')
  return { oportunidades, filtro }
})
