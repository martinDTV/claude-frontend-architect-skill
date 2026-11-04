// SSR on by default: module scope runs on the server, so shared MUTABLE module state would leak.
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
