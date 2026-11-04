import axios from 'axios'
// Defect A: one Axios instance at module scope, shared by every SSR request; its Authorization header
// is mutated globally, so one user's bearer token can serve the next user's request during SSR.
export const http = axios.create({ baseURL: '/api' })
export function authorize(token: string) {
  http.defaults.headers.common.Authorization = `Bearer ${token}`
}
