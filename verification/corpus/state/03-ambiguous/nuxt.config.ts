// ssr is not set here, so it defaults to true. Whether the module-level binding below leaks across
// requests depends on this rendering mode, which is exactly what makes the finding ambiguous.
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
