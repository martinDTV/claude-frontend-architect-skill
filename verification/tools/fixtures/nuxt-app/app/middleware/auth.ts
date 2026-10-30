export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore()
  if (!auth.user) return navigateTo('/auth/login')
  // shell middleware depending on a domain composable
  const { canSee } = useFeatureFlags()
  if (to.path.startsWith('/sales') && !canSee('sales')) return navigateTo('/')
})
