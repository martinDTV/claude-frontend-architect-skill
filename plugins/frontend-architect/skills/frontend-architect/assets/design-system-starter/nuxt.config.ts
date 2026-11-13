// design-system-starter — a Nuxt 4 layer. Extend it from an app (`extends: ['./layers/design-system']` or a package)
// or copy app/ into your project. Tokens come from design-contract.json through design-contract.mjs: regenerate
// them, never edit them. Nuxt UI provides the primitives; the components under app/components/ui are the project's
// layer on top (rules, states, names) and are what design-system-inventory.mjs --agents describes to agents.
// Relative paths in a layer's nuxt.config resolve against the consuming app, so the stylesheets are given as absolute
// paths resolved from this file (standard URL API: no @nuxt/kit, no node types needed).
const here = (p: string) => decodeURIComponent(new URL(p, import.meta.url).pathname)

export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: [here('./app/assets/css/tokens.css'), here('./app/assets/css/nuxt-ui-map.css')],
  // The design-system folder is registered without the directory prefix, so <DsButton> is DsButton (not UiDsButton)
  // both through auto-import and through the barrel.
  components: [{ path: here('./app/components/ui'), pathPrefix: false }],
  compatibilityDate: '2026-10-01',
})
