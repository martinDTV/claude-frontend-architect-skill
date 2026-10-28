---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Structural decisions: module with a public entry and explicit imports instead of flat auto-imported composables, filters moved to the URL, tasks moved from the Pinia store to a query cache or useFetch, one table component with column configs
- Visual decisions for all-day desktop use: quiet dense direction statement, hierarchy with the numbers that drive action, compact density mode, tabular numerals, tokens-based color for status, consistent loading/empty/error states
- Uses Nuxt UI components rather than hand-made tables and modals
- Motion limited to state feedback; no decorative effects

The response FAILS if it does any of the following:
- Proposes Three.js, gradients or scroll animation for an operational tool
- Keeps server data in the Pinia store
- Proposes microfrontends or a rewrite
