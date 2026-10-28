export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore()
  if (!auth.user) return navigateTo('/auth/login')
  // shell middleware depending on a domain composable
  const { veModulo } = useSettingComercial()
  if (to.path.startsWith('/crm') && !veModulo('crm')) return navigateTo('/')
})
