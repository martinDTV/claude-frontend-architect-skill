# Audit scripts

Read-only, dependency-free Node (>= 18) tools that turn the skill's rules into measurements. Run them from any directory; pass the project root as the first argument. From the skill: `node ${CLAUDE_SKILL_DIR}/scripts/<tool>.mjs <project-root> [options]`.

| Tool | Answers | Writes anything? |
|---|---|---|
| `domain-deps.mjs` | Which business domains depend on which, including Nuxt auto-imports and template components (verified through `.nuxt` metadata when present, inferred otherwise); unknown symbols; boundary violations; hotspots; cycles | No |
| `component-complexity.mjs` | Which components and pages carry too many responsibilities | No |
| `state-audit.mjs` | Where state lives: stores shared across domains, server data in stores or copied into them from queries, raw `useState` keys, tokens in web storage, module-level state that leaks across SSR requests, logout without cache clear | No |
| `routes-audit.mjs` | Routes and their guards; Next.js Server Actions and Route Handlers without visible authorization; `'use client'` too high | No |
| `leak-patterns.mjs` | Listeners, intervals, observers, streams, GSAP, Lenis, Three.js and subscriptions created without a visible cleanup | No |
| `contracts-check.mjs` | Module entry points, internal imports, module cycles, and breaking changes against a baseline | Only with `--write-baseline` |
| `bundle-budget.mjs` | Startup and chunk sizes (gzip) of an existing build against budgets | No (never builds) |

Every tool supports `--help`, `--json`, `--md` and `--fail-on confirmed|any|none`. Exit codes: `0` nothing to fail on, `1` findings matched `--fail-on` (default: any **confirmed** finding), `2` the tool could not run (no `package.json`, no build, bad config).

## Levels: what a finding means

- **confirmed**: the pattern is present as stated. An import exists, a literal key is written to `localStorage`, a budget number is exceeded, or an auto-import edge is backed by Nuxt's own metadata. Still read the code before acting: "present" is not "wrong in this product".
- **heuristic**: a lexical signal. Auto-import usage inferred by this tool's scanning rules, cleanup that may live in a helper the tool does not know, a Server Action that may check authorization through a wrapper. Verify before reporting it as a defect.
- **info**: inventory and suggestions.

## Dependency confidence (domain-deps, contracts-check, state-audit)

Every edge in the graph carries a confidence:

| Confidence | Meaning | Source |
|---|---|---|
| **verified** | The dependency exists as Nuxt or the bundler sees it | An explicit `import` resolved to an existing file; an auto-imported composable, util or store listed in `.nuxt/types/imports.d.ts`; a component listed in `.nuxt/components.d.ts` |
| **inferred** | Resolved only by this tool's re-implementation of Nuxt's scanning rules (top-level `composables/` and `utils/`, `shared/`, `imports.dirs`, stores dirs, `components` dirs with the path-prefix naming rule, `layers/*`) | Lexical scan |
| **unknown** | A `useX(` call or a PascalCase tag that resolves to no project file and no package | Listed in the `unknown-symbols` section; never an edge |
| **package** | Provided by a dependency (VueUse, Nuxt UI, Pinia…) according to the metadata | Listed, never an edge |

The metadata files are written by `nuxt prepare`, `nuxt dev` and `nuxt build`. The tools read them when present (read-only), drop entries whose files no longer exist (reported as stale) and warn when the metadata is older than the newest source file ("run `nuxt prepare`"). Without them, every auto-import edge is `inferred` and findings that depend on such edges stay `heuristic`. With them, boundary findings backed by a verified edge are `confirmed`. Nothing is ever executed to obtain the metadata: if it is missing, the user runs `nuxt prepare` in the project.

`state-audit` adds `server-data-copied-to-store` (heuristic): a component or composable that fetches or queries and writes the result into a store (assignment, setter call, or a `storeToRefs` ref) duplicates data the query cache already owns. Writes of literals and writes in files without any fetch are not reported.

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
- They do not run Nuxt. Verified auto-import edges come from metadata Nuxt already generated; when it is absent or stale the tools say so and fall back to inference.
- They do not execute code, install packages, build or write (except `--write-baseline`).
- They do not prove security. A declared guard is UX; authorization lives in the backend.
- They are not a substitute for `nuxt typecheck`, `tsc`, ESLint, dependency-cruiser or the framework analyzers; they point at what to look at first.

## Typical sequence for an audit

```bash
# optional but recommended in Nuxt projects: refresh .nuxt metadata first (the tools never run it)
#   pnpm nuxt prepare
node $S/domain-deps.mjs . --suggest-config > .frontend-audit.json   # then group the folders into domains by hand
node $S/domain-deps.mjs . --md > audit/domains.md
node $S/component-complexity.mjs . --top 30 --md > audit/components.md
node $S/state-audit.mjs . --md > audit/state.md
node $S/routes-audit.mjs . --md > audit/routes.md
node $S/leak-patterns.mjs . --md > audit/leaks.md
node $S/contracts-check.mjs . --write-baseline audit/contracts.json
pnpm build && node $S/bundle-budget.mjs . --md > audit/bundle.md
```

Tests and fixtures live in the repository under `verification/tools/` (not shipped with the plugin): `node --test verification/tools/*.test.mjs`.
