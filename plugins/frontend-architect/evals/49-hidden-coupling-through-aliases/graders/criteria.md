---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- States that the alias does not change the dependency: `#core/orders/internal/pricing` resolves to a file inside the orders module, so billing depends on orders internals; recommends exporting `applyDiscounts` (or a narrower function) from the orders public entry (`index.ts`) and importing from there
- Distinguishes the three imports: the internal runtime import is the coupling that matters; the import through the barrel (`ORDER_STATES` re-exported by `index.ts`) is a legitimate use of the public contract; the `import type { OrderLine }` is a compile-time dependency that disappears at runtime and is weaker, though it still ties billing to the orders type contract
- Recommends an enforced rule: dependency-cruiser (or eslint-plugin-boundaries) configured so that `modules/*/internal/**` (or anything except `index.ts`) cannot be imported from another module, with the alias resolved through the tsconfig so the rule sees `#core/*` paths; mentions baselining the public surface (the plugin's contracts-check tooling or equivalent) so removed exports are caught
- Explains that re-exports and aliases hide coupling from a naive grep for relative imports, so the dependency graph must resolve aliases and follow barrels

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Treats the `import type` as equivalent to a runtime coupling, or dismisses it as having no architectural meaning at all
- Says the alias makes the internal import acceptable
- Proposes microfrontends, a monorepo split or a rewrite to solve one internal import
- Recommends deleting the `index.ts` barrel or disabling boundary rules
