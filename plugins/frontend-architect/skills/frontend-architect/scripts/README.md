# Audit scripts

Read-only, dependency-free Node (>= 18) tools that turn the skill's rules into measurements. Run them from any directory; pass the project root as the first argument. From the skill: `node ${CLAUDE_SKILL_DIR}/scripts/<tool>.mjs <project-root> [options]`.

| Tool | Answers | Writes anything? |
|---|---|---|
| `domain-deps.mjs` | Which business domains depend on which, including Nuxt auto-imports and template components; boundary violations; hotspots; cycles | No |
| `component-complexity.mjs` | Which components and pages carry too many responsibilities | No |
| `state-audit.mjs` | Where state lives: stores shared across domains, server data in stores, raw `useState` keys, tokens in web storage, module-level state that leaks across SSR requests, logout without cache clear | No |
| `routes-audit.mjs` | Routes and their guards; Next.js Server Actions and Route Handlers without visible authorization; `'use client'` too high | No |
| `leak-patterns.mjs` | Listeners, intervals, observers, streams, GSAP, Lenis, Three.js and subscriptions created without a visible cleanup | No |
| `contracts-check.mjs` | Module entry points, internal imports, module cycles, and breaking changes against a baseline | Only with `--write-baseline` |
| `bundle-budget.mjs` | Startup and chunk sizes (gzip) of an existing build against budgets | No (never builds) |

Every tool supports `--help`, `--json`, `--md` and `--fail-on confirmed|any|none`. Exit codes: `0` nothing to fail on, `1` findings matched `--fail-on` (default: any **confirmed** finding), `2` the tool could not run (no `package.json`, no build, bad config).

## Levels: what a finding means

- **confirmed**: the pattern is present as stated. An import exists, a literal key is written to `localStorage`, a budget number is exceeded. Still read the code before acting: "present" is not "wrong in this product".
- **heuristic**: a lexical signal. Auto-import usage is matched by identifier, cleanup may live in a helper the tool does not know, a Server Action may check authorization through a wrapper. Verify before reporting it as a defect.
- **info**: inventory and suggestions.

Reports must keep this distinction. The `frontend-reviewer` agent and the skill's `references/auditing.md` describe how to turn these outputs into "demonstrated problems" versus "hypothetical risks".

## Configuration: `.frontend-audit.json`

Optional, at the project root (or `--config path`). Without it, folders are classified by convention (`features/<x>`, `components/<x>`, `pages/<x>`, Next.js route segments); flat Nuxt composables are "unclassified" and counted as shared. `domain-deps.mjs --suggest-config` prints a starter file.

```json
{
  "domains": {
    "crm": ["app/components/crm/**", "app/pages/crm/**", "app/composables/useCrm.ts", "app/types/crm.ts"],
    "obra": ["app/pages/proyectos/**", "app/composables/useGeneradores.ts"]
  },
  "shell": ["app/layouts/**", "app/middleware/**", "app/plugins/**", "app/pages/index.vue"],
  "shared": ["app/components/ui/**", "app/utils/**", "app/composables/useApi.ts"],
  "coreDomains": ["auth", "organizations"],
  "coreStores": ["auth", "ui"],
  "publicRoutes": ["app/pages/auth/**"],
  "authPatterns": ["requireUser(", "assertCan("],
  "excludeTests": true,
  "budgets": { "entryJsKb": 250, "entryCssKb": 60, "maxChunkKb": 300, "totalJsKb": null }
}
```

- `domains`: globs (relative to the project root) per business domain; first match wins.
- `shell` / `shared`: globs for app chrome and domain-free code.
- `coreDomains`: domains the shell may depend on (session, tenant) without a finding.
- `coreStores`: store ids expected to be used everywhere.
- `publicRoutes`: pages that need no guard.
- `authPatterns`: extra function names that count as an authorization check in Server Actions and handlers.
- `budgets`: gzip KB budgets for `bundle-budget.mjs`.

## What the tools do not do

- They do not parse TypeScript. Comments and strings are blanked before matching; regex literals and unusual formatting can produce misses or false hits.
- They do not execute code, install packages, build or write (except `--write-baseline`).
- They do not prove security. A declared guard is UX; authorization lives in the backend.
- They are not a substitute for `nuxt typecheck`, `tsc`, ESLint, dependency-cruiser or the framework analyzers; they point at what to look at first.

## Typical sequence for an audit

```bash
node $S/domain-deps.mjs . --suggest-config > .frontend-audit.json   # then group the folders into domains by hand
node $S/domain-deps.mjs . --md > audit/domains.md
node $S/component-complexity.mjs . --top 30 --md > audit/components.md
node $S/state-audit.mjs . --md > audit/state.md
node $S/routes-audit.mjs . --md > audit/routes.md
node $S/leak-patterns.mjs . --md > audit/leaks.md
node $S/contracts-check.mjs . --write-baseline audit/contracts.json
pnpm build && node $S/bundle-budget.mjs . --md > audit/bundle.md
```

Tests and fixtures live in the repository under `verification/tools/` (not shipped with the plugin): `node --test verification/tools/`.
