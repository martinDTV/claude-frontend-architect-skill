---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Explains `--engine auto` (default: semantic when a usable `typescript` is found, otherwise lexical with the reason printed), `--engine semantic` (fails instead of falling back, right for CI when the semantic result is required) and `--engine lexical` (the 1.1 regex analysis, also the mode that loads nothing from the project)
- Diagnoses the two lexical reports honestly: the pnpm app probably needs `--typescript <dir>` (or the engine's fallback through the `nuxt`/`vite` package directories) and `--vue-compiler <dir>` for `.vue` files; the TypeScript 7 preview ships no JavaScript compiler API, so the engine must fall back to lexical until a 5.x/6.x TypeScript is available for analysis (`--typescript` pointing at one)
- Tells the reviewer what the lexical engine can and cannot be trusted for: explicit `~/`, `@/` and relative imports and `.nuxt`-verified auto-imports are reliable; `tsconfig` `paths` aliases, barrels, type-only distinctions, `<component is>` targets and dependencies inside template literals are not resolved or not distinguished
- Explains the `Analysis` line (engine, compiler versions and where they were loaded from, tsconfig used, fallbacks) and the per-edge `resolution` values (`typescript`, `tsconfig-paths`, `relative`, `nuxt-metadata` = verified; `lexical-catalog`/`lexical-fallback` = inferred) as the way to decide how much to trust an edge before acting on a finding
- Keeps exit codes and output contract the same across engines, so CI wiring does not change

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Claims the lexical engine is equivalent to the semantic one, or that the semantic engine type-checks the project
- Recommends installing TypeScript into the audited repositories from the audit tool, or running `nuxt prepare`/builds automatically
- Says TypeScript 7 is supported by the semantic engine
- Invents flags that do not exist (anything other than `--engine`, `--typescript`, `--vue-compiler`, `--format` and the tools' documented options)
