---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- States that the barrel is an intermediate hop, not the owner: `useOportunidades` is declared in `~/composables/useOportunidades`, `registrarEvento` arrives through `export * from './eventos'` and is declared in that module, and the page depends on both owners as well as on the barrel
- Explains that `export *` hides the names it publishes until the target module is read, so attributing a name requires following the re-export chain (file by file, with cycle and depth guards) rather than reading `index.ts` alone
- Recommends the plugin's semantic engine for this: `domain-deps.mjs` records the origin of each imported name (declaring file, number of barrel hops, whether an `export *` was crossed) and `--follow-reexports` adds the importer → owner edges next to the barrel edge, or an equivalent symbol-level resolution
- Keeps the two views apart in the report: the barrel edge is the public-contract dependency, the owner edge is the real coupling; both are shown, neither replaces the other
- Treats type-only re-exports (`export type { Oportunidad }`) as compile-time coupling: reported, but separated from runtime dependencies

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Guesses the owner file from naming conventions instead of following the exports
- Claims a regex over `import` statements can attribute names that come through `export *`
- Recommends removing the barrel or forbidding re-exports as the fix
- Says the page depends only on `index.ts`
