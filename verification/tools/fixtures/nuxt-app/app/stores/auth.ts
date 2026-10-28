import { defineStore } from 'pinia'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ id: string } | null>(null)
  const access = ref<string | null>(null)
  async function login(email: string, password: string) {
    const { api } = useApi()
    const { data } = await api.post('/auth/login', { email, password })
    access.value = data.access
    localStorage.setItem('nexus:access', data.access)
    localStorage.setItem('nexus:refresh', data.refresh)
    setToken(data.access)
  }
  function logout() {
    localStorage.removeItem('nexus:access')
    clearNuxtState()
  }
  return { user, access, login, logout }
}, { persist: true })
