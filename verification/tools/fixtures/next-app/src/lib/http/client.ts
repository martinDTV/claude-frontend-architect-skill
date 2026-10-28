import axios from 'axios'
export const http = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL })
export function setToken(token: string) {
  http.defaults.headers.common.Authorization = `Bearer ${token}`
}
