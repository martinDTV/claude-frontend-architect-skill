export default defineAppConfig({
  // Nuxt UI reads the contract's accent and neutral ramps (emitted into @theme by design-contract.mjs)
  ui: { colors: { primary: 'accent', neutral: 'contract-neutral' } },
})
