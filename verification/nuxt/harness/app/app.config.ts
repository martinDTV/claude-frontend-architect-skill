// Nuxt UI 4 semantic colours mapped onto the Tailwind colour names the design contract's ramps define
// (verification/design/contracts/atlas-logistics.json → app/assets/css/tokens.css).
export default defineAppConfig({
  ui: {
    colors: { primary: 'accent', secondary: 'neutral', neutral: 'neutral', success: 'success', warning: 'warning', error: 'danger', info: 'info' },
  },
})
