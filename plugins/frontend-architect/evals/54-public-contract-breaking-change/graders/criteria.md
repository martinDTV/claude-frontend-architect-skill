---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Treats the module entry (`index.ts`) as a public contract whose changes are breaking changes even inside one repository: rename by adding the new export, keeping the old name as a deprecated alias (with a date and removal plan), migrating consumers in the same change, and removing only afterwards
- Recommends a baseline of each module's public surface diffed in CI (the plugin's `contracts-check.mjs --write-baseline` / `--baseline` or an equivalent script) so a removed or renamed export fails the pull request until the baseline is updated on purpose
- Notes that TypeScript is the first alarm when consumers import from the entry (the compile fails), so typecheck must run on every pull request and the consumers must be in the same type-check scope; explains why the break reached staging anyway if typecheck was missing or the import was untyped
- Keeps it inside one app: no per-module semver or publishing, but a pull-request rule that a contract change includes its consumers, plus boundary rules so consumers only ever import from the entry

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Proposes publishing each module as a separately versioned package as the only or primary mechanism
- Suggests disabling the boundary or contract rule, or letting modules import internals to avoid the entry
- Recommends microfrontends or a monorepo split for this problem
