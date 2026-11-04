import { defineStore } from 'pinia'
import { http, authorize } from '~/lib/http'
export const useAccountStore = defineStore('account', () => {
  // Defect B: the store fetches server data and keeps it as an entity array (two sources of truth with
  // the query cache), AND holds an access token.
  const invoices = ref<Invoice[]>([])
  const accessToken = ref('')
  async function loadInvoices() {
    const { data } = await http.get('/invoices')
    invoices.value = data
  }
  async function login(email: string, password: string) {
    const { data } = await http.post('/auth', { email, password })
    accessToken.value = data.token
    authorize(data.token)
  }
  // Defect D: logout drops the in-memory token but clears no query cache and no app state.
  function logout() {
    accessToken.value = ''
  }
  return { invoices, accessToken, loadInvoices, login, logout }
}, { persist: true })
