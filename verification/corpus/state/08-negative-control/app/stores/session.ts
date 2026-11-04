import { defineStore } from 'pinia'
export const useSessionStore = defineStore('session', () => {
  // Client-owned state only: who is logged in, surfaced by the server via the HttpOnly cookie session.
  // No token is stored, no server list is duplicated here, and the store is not persisted.
  const user = ref<{ id: string } | null>(null)
  function setUser(u: { id: string } | null) { user.value = u }
  // A clean logout: reset the store and clear Nuxt's payload/query state so no stale data survives.
  function logout() {
    user.value = null
    clearNuxtState()
    clearNuxtData()
  }
  return { user, setUser, logout }
})
