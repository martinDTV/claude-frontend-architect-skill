import { useLocalStorage } from '@vueuse/core'

// Same defect as "a token in localStorage", reached through two DIFFERENT APIs:
//   1) sessionStorage.setItem instead of localStorage.setItem
//   2) the VueUse useLocalStorage() wrapper instead of a raw storage call
// Both leave a readable token in web storage; neither is an HttpOnly cookie.
export function useAuth() {
  const bearer = useLocalStorage('auth_token', '')
  async function signIn(email: string, password: string) {
    const data = await $fetch<{ accessToken: string; refreshToken: string }>('/api/login', {
      method: 'POST',
      body: { email, password },
    })
    sessionStorage.setItem('refresh_token', data.refreshToken)
    bearer.value = data.accessToken
  }
  return { signIn }
}
