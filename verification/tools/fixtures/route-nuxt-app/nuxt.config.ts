export default defineNuxtConfig({ ssr: true, routeRules: { '/admin/**': { ssr: false } } })
