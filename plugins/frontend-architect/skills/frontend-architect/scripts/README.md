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

## Analysis engine (1.2.0)

The six graph-based tools (`domain-deps`, `contracts-check`, `state-audit`, `routes-audit`, `leak-patterns`, `component-complexity`) build the file graph with one of two engines:

| Engine | How | When |
|---|---|---|
| **semantic** | TypeScript, TSX and JavaScript parsed with the audited project's own `typescript` (syntax trees, no type checker); `.vue` files parsed with its `vue/compiler-sfc`; specifiers resolved with the project's `tsconfig` (`paths`, `baseUrl`, `moduleResolution`) through `ts.resolveModuleName`, and for Nuxt the generated `.nuxt/tsconfig.app.json` / `tsconfig.server.json` | Default (`--engine auto`) whenever a `typescript` with the JavaScript API is found in the project (or in `--typescript <dir>`) |
| **lexical** | The 1.1 engine: regular expressions over blanked code and the fixed alias table | Fallback when `typescript` is missing or is the TypeScript 7 preview (no JavaScript API), or on request (`--engine lexical`) |

Flags: `--engine auto|semantic|lexical` (`semantic` exits 2 instead of falling back), `--typescript <dir>`, `--vue-compiler <dir>` (directories whose `node_modules` hold the packages; useful for pnpm layouts and for auditing code you do not trust with a known compiler), `--format text|json|markdown`. Every report starts with an `Analysis` line (JSON: top-level `analysis`) naming the engine, the compiler versions and paths, the tsconfig files, the resolution methods and any per-file fallbacks. Exit codes and every 1.1 field are unchanged.

What the semantic engine changes in the output: edges carry `kind` (`runtime` or `type`), `resolution` (`typescript`, `tsconfig-paths`, `relative`, `nuxt-metadata`, `lexical-catalog`) and the import `specifier`; type-only imports lower the severity of boundary findings and never form cycles; a symbol counts as an auto-import use only when it is a value identifier (not a property name, key, string or comment); `'use client'` / `'use server'` are read as directive prologues; cleanup hooks and SFC metrics come from calls and compiler bindings; imports that resolve nowhere are listed under *Unresolved imports* with a reason and never become edges. Design, trust boundary and limits: `docs/semantic-engine.md` in the repository; measured differences against the lexical engine: `docs/benchmarks.md`.

The one thing to know before running it on code you do not trust: with the semantic engine the tool loads `typescript` and `vue/compiler-sfc` from the audited project's `node_modules` into its own process. Pass `--typescript`/`--vue-compiler` pointing at an installation you control, or `--engine lexical`, when that matters.

## Dependency confidence (domain-deps, contracts-check, state-audit)

Every edge in the graph carries a confidence:

| Confidence | Meaning | Source |
|---|---|---|
| **verified** | The dependency exists as Nuxt or the bundler sees it | An explicit `import` resolved to an existing file (semantic engine: by TypeScript with the project's compiler options, by a `tsconfig` `paths` mapping or as a relative path; lexical engine: by the alias table); an auto-imported composable, util or store listed in `.nuxt/types/imports.d.ts`; a component listed in `.nuxt/components.d.ts` |
| **inferred** | Resolved only by this tool's re-implementation of Nuxt's scanning rules (top-level `composables/` and `utils/`, `shared/`, `imports.dirs`, stores dirs, `components` dirs with the path-prefix naming rule, `layers/*`) | Lexical scan |
| **unknown** | A `useX(` call or a PascalCase tag that resolves to no project file and no package | Listed in the `unknown-symbols` section; never an edge |
| **package** | Provided by a dependency (VueUse, Nuxt UI, Pinia…) according to the metadata, or an import of a declared or installed package | Listed, never an edge |
| **unresolved import** (semantic) | An import specifier that resolves to no file and no package: non-literal dynamic import, missing file, undeclared bare specifier, a target outside the project | Listed with the reason; never an edge |

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

- They do not type-check. The semantic engine parses syntax trees and resolves modules with the project's TypeScript, but creates no program and no type checker: symbols are matched by name, `export *` barrels are not expanded, dynamic specifiers stay unresolved. The lexical fallback blanks comments and strings before matching and can still miss or over-match on unusual formatting; the `Analysis` line says which engine produced a report.
- They do not run Nuxt. Verified auto-import edges come from metadata Nuxt already generated; when it is absent or stale the tools say so and fall back to inference.
- They do not execute project code, install packages, build or write (except `--write-baseline`). The semantic engine loads the project's `typescript` and `vue/compiler-sfc` libraries; it never loads `nuxt.config`, `next.config`, plugins or transformers.
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
