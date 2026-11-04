// Per request, inside the plugin: no instance is created at module scope and no auth header is mutated.
// credentials:'include' sends the HttpOnly session cookie the server set; the token never reaches JS.
export default defineNuxtPlugin(() => {
  const api = $fetch.create({ baseURL: '/api', credentials: 'include' })
  return { provide: { api } }
})
