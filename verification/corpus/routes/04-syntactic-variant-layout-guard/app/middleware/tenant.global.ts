export default defineNuxtRouteMiddleware((to) => {
  const headers = useRequestHeaders(['x-tenant'])
  useState('tenant', () => headers['x-tenant'] ?? 'default')
})
