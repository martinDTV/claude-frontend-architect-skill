// Nuxt UI 4 semantic colours mapped onto the Tailwind colour names the design contract's ramps define
// (verification/design/contracts/atlas-logistics.json → app/assets/css/tokens.css).
export default defineAppConfig({
  ui: {
    // "neutral" would name Tailwind's own grey to Nuxt UI (kept as old-neutral): the contract's tinted neutral comes in as contract-neutral
    colors: { primary: 'accent', secondary: 'contract-neutral', neutral: 'contract-neutral', success: 'success', warning: 'warning', error: 'danger', info: 'info' },
  },
})
