// Fixture: a Nuxt 4 app with flat auto-imported composables, one nested imports dir and a prefix-less shell dir.
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  components: [{ path: '~/components/shell', pathPrefix: false }, '~/components'],
  imports: { dirs: ['composables/catalog'] },
  runtimeConfig: { public: { apiBase: '/api/v1' } },
  compatibilityDate: '2026-10-01',
})
