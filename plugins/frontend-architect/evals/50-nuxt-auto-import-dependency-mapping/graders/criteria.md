---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Points out that grepping `import` statements misses the auto-imports entirely, because Nuxt resolves composables and components without import lines
- Identifies the generated metadata as the authoritative map: `.nuxt/types/imports.d.ts` (composables, utils, stores, including the layer's) and `.nuxt/components.d.ts` (components with their resolved paths); they are produced by `nuxt prepare` / `nuxt dev` and must be regenerated before trusting them, since stale metadata misses new files
- Recommends the plugin's `domain-deps.mjs` (or equivalent tooling) with a folder-to-domain classification, reporting edges as verified when backed by the metadata, inferred when resolved lexically, and listing unknown symbols separately; notes that findings through inferred edges must be read in the code before being called defects
- Makes the map enforceable going forward: move domain composables and components out of auto-imported directories into modules with an explicit public entry (`index.ts`), import across modules only from the entry, and add a boundary rule in CI

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Says grepping import statements is sufficient for a Nuxt app
- Recommends adding `imports.dirs` or `components.dirs` for domain code, which widens the implicit graph
- Suggests running `nuxt prepare`, builds or scripts automatically inside an audit tool without saying so, or trusting metadata without checking freshness
- Proposes microfrontends or Module Federation as the way to get boundaries
