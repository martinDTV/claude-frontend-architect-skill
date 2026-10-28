import axios from 'axios'
export default defineNuxtPlugin(() => {
  const api = axios.create({ baseURL: useRuntimeConfig().public.apiBase })
  return { provide: { api } }
})
