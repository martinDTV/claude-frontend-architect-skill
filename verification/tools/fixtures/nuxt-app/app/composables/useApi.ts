import axios from 'axios'
// Module-level instance with a mutable Authorization header: shared by every SSR request.
const api = axios.create({ baseURL: '/api/v1' })
export function setToken(token: string) {
  api.defaults.headers.common.Authorization = `Bearer ${token}`
}
export function useApi() {
  return { api, apiFetch: <T>(url: string) => api.get<T>(url).then((r) => r.data) }
}
