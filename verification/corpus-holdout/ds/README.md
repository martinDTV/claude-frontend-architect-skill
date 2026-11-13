# ds hold-out, set B (blind generalization)

Six cases written on 2026-11-13 by an independent agent from the contract (`docs/review/v1.8.0-inventory-contract.md`) and the corpus methodology only, without opening `design-system-inventory.mjs` or any development case beyond `ds/01` (format reference). Each `scaffold.sh` writes a tiny Nuxt 4 + @nuxt/ui project into the current directory; `ground-truth.json` was written from those sources, never from tool output. Findings are component-level, so every expected item is `line: 1` with `line_tolerance: 1`.

- B-01-model-only-wrapper — single UInput root with only a `defineModel`: forbidden pass-through (a model is an API); sibling AppBadge is a genuine pass-through (expected, confirmed).
- B-02-stories-documented — no barrel; StatusPill has no comment but a sibling `.stories.ts` (forbidden undocumented); Kbd has nothing (expected undocumented-public-component).
- B-03-barrel-default-as-exports — barrel uses `export { default as X }` plus a type-only export; exported undocumented CardHeader is the finding, non-exported undocumented CardSkeleton is private (forbidden).
- B-04-ejected-whitespace-drift — two `@ds-ejected` copies with scaffold-computed sha256 over the body; AppToast was re-indented after hashing (expected drifted, bytes differ), AppTooltip is fresh (forbidden).
- B-05-data-view-no-partial — `useAsyncData` view with loading/error/empty/success but no partial state (expected data-view-missing-states, heuristic); PriceTag has no async (forbidden).
- B-06-clean-two-root-and-spread — clean: two-root `<UAlert v-if>/<div v-else>` with no props is NOT a wrapper (forbidden pass-through); props spread from an import is info-level only (`props-partially-resolved` out_of_scope); expected is empty.
