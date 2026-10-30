---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Explains the budgets: `--typecheck-max-files` (default 2500), `--typecheck-max-source-mb` (20) and `--typecheck-max-heap-mb` (1024); when a budget is exceeded the checker is skipped with a stated reason and the syntactic, barrel-following origins stand; the report does not become empty and the skip is visible, never hidden
- Explains what the checker covers: TypeScript root files loaded into a Program; `.vue` importers are outside the Program, so origins from `.vue` files remain syntactic; the type checker refines TypeScript origins and records whether it agrees with the syntactic ones, it does not replace the analysis
- Points to `analysis.typechecker` in the output for completeness: root files, source files loaded, wall ms, CPU ms, heap MB, RSS MB, the skip reason when a budget triggered, and the count of origins checked and agreeing
- Gives the measured order of magnitude so the fear is sized: on an 80k-line Nuxt application, read-only, a plain `domain-deps` run takes about 1.5 s wall and ~266 MB RSS; with `--typecheck` about 3.5 s wall and ~636 MB RSS, with roughly 1,400 source files loaded and a few hundred origins checked, all agreeing; seconds and hundreds of MB, not minutes and gigabytes, but not free either
- Recommends a cadence and settings: the plain syntactic run on every PR; `--typecheck` on a schedule or on PRs that touch public entries or the dependency policy, with the heap budget set under the runner's share (well below 4 GB) and the `typechecker` block kept with the report so completeness is auditable
- States that the tool stays read-only and executes none of the project's code apart from loading `typescript` (and `vue/compiler-sfc`) according to the engine choice, with `--typescript <dir>` for a trusted install

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Claims the type checker is free or negligible, or that it runs unbounded with no budgets
- Hides or omits that a skipped checker leaves a partial, syntactic analysis, or says the report can be silently incomplete
- Recommends running `--typecheck` on every commit without budgets or without considering the runner's memory
- Claims `.vue` files are type-checked inside the Program
