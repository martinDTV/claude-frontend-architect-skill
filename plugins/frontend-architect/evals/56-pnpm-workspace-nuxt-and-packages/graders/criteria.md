---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Explains the scope rule: run from the workspace root to get edges between the app and the packages (workspace packages are internal code, resolved by name through their `package.json` `exports`/`main`); run from inside `apps/web` and sibling packages are only named as workspace imports, never followed, which is why they looked external
- Explains how `exports` works for the audit: `"."` and `"./button"` are the published entries; `@acme/ui/src/internal/theme` is a subpath the map does not publish, so Node and strict bundlers refuse it; recommends the `package-subpath-not-exported` finding (or an equivalent check) and treating it as a boundary violation, not a style issue
- Keeps the analysis inside the repository: packages outside the audited root are listed, not read; nothing is installed, built or executed to resolve them
- Mentions that contracts for packages come from `package.json` (entry = `exports["."]` or `main`), so `contracts-check` style rules (internal imports, barrels publishing code owned by another package) apply to workspace packages too
- Distinguishes external dependencies (declared in a package.json, not followed) from workspace packages (followed from the root)

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends running the audit only from `apps/web` and accepting the packages as external
- Suggests editing `exports` to publish `src/internal/*` so the deep imports stop being reported
- Proposes installing dependencies, running builds or symlinking packages as part of the audit
- Recommends splitting the repository or publishing the packages to a registry to make them auditable
