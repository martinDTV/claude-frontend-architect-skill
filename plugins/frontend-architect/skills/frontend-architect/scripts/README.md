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
| `ui-audit.mjs` (1.4) | Accessibility and form-quality patterns provable from Vue templates and JSX; every finding says whether the markup proves it (`static`), needs reading (`review`) or needs a rendered page (`browser`); controls inside a component that declares a label-like prop are counted as encapsulated, not reported | No |
| `browser-audit.mjs` (1.4, opt-in **browser mode**) | What a rendered page shows: axe-core violations, keyboard reachability, dialogs, form behaviour, responsive defects per viewport and text scale, server HTML against the hydrated DOM, visual regression against approved baselines | Only under `--out` (report, optional masked screenshots) and, with `--write-baseline` / `--approve`, under `--baseline-dir`; nothing elsewhere |

Every tool supports `--help`, `--json`, `--md` and `--fail-on confirmed|any|none`. The static tools (all but `browser-audit`) are read-only toward the project and spawn nothing; `browser-audit` is the one tool that drives a browser, and only when you hand it one (`--playwright <dir>`); the section *Browser mode* below lists what it will and will not do. Exit codes: `0` nothing to fail on, `1` findings matched `--fail-on` (default: any **confirmed** finding), `2` the tool could not run (no `package.json`, no build, bad config).

## Levels: what a finding means

- **confirmed**: the pattern is present as stated. An import exists, a literal key is written to `localStorage`, a budget number is exceeded, or an auto-import edge is backed by Nuxt's own metadata. Still read the code before acting: "present" is not "wrong in this product".
- **heuristic**: a lexical signal. Auto-import usage inferred by this tool's scanning rules, cleanup that may live in a helper the tool does not know, a Server Action that may check authorization through a wrapper. Verify before reporting it as a defect.
- **info**: inventory and suggestions.

## Analysis engine (1.2.0, extended in 1.3.0)

The seven graph-based tools (`domain-deps`, `contracts-check`, `state-audit`, `routes-audit`, `leak-patterns`, `component-complexity` and, since 1.4, `ui-audit`) build the file graph with one of two engines:

| Engine | How | When |
|---|---|---|
| **semantic** | TypeScript, TSX and JavaScript parsed with the audited project's own `typescript` (syntax trees, no type checker); `.vue` files parsed with its `vue/compiler-sfc`; specifiers resolved with the project's `tsconfig` (`paths`, `baseUrl`, `moduleResolution`) through `ts.resolveModuleName`, and for Nuxt the generated `.nuxt/tsconfig.app.json` / `tsconfig.server.json` | Default (`--engine auto`) whenever a `typescript` with the JavaScript API is found in the project (or in `--typescript <dir>`) |
| **lexical** | The 1.1 engine: regular expressions over blanked code and the fixed alias table | Fallback when `typescript` is missing or is the TypeScript 7 preview (no JavaScript API), or on request (`--engine lexical`) |

Flags: `--engine auto|semantic|lexical` (`semantic` exits 2 instead of falling back), `--typescript <dir>`, `--vue-compiler <dir>` (directories whose `node_modules` hold the packages; useful for pnpm layouts and for auditing code you do not trust with a known compiler), `--format text|json|markdown`. Every report starts with an `Analysis` line (JSON: top-level `analysis`) naming the engine, the compiler versions and paths, the tsconfig files, the resolution methods and any per-file fallbacks. Exit codes and every 1.1 field are unchanged.

What the semantic engine changes in the output: edges carry `kind` (`runtime` or `type`), `resolution` (`typescript`, `tsconfig-paths`, `relative`, `nuxt-metadata`, `lexical-catalog`) and the import `specifier`; type-only imports lower the severity of boundary findings and never form cycles; a symbol counts as an auto-import use only when it is a value identifier (not a property name, key, string or comment); `'use client'` / `'use server'` are read as directive prologues; cleanup hooks and SFC metrics come from calls and compiler bindings; imports that resolve nowhere are listed under *Unresolved imports* with a reason and never become edges. Design, trust boundary and limits: `docs/semantic-engine.md` in the repository; measured differences against the lexical engine: `docs/benchmarks.md`.

The one thing to know before running it on code you do not trust: with the semantic engine the tool loads `typescript` and `vue/compiler-sfc` from the audited project's `node_modules` into its own process, which executes the code of those packages and of what they require. It is not an isolated analysis. Pass `--typescript`/`--vue-compiler` pointing at an installation you control, or `--engine lexical` (loads nothing from the project; loses alias resolution through `tsconfig`, symbol origins and the AST-based rules), when that matters.

### What 1.3.0 adds on top

| Capability | Where | Resolution level it reports |
|---|---|---|
| Symbol origins through barrels (`export { a as b } from`, `export *`, re-exports of imports, `.vue` defaults) | every import edge carries `origins[]` (`status`, `file`, `hops`, `viaStar`); summary `symbolResolution`; `domain-deps --follow-reexports` adds importer → declaring-file edges (`via: reexport`, `resolution: syntax-reexport`) | **syntactic**: the chain of re-exports is followed on the parsed modules; no type information |
| `--typecheck` (`domain-deps`) | a TypeScript Program verifies each syntactic origin (`verifiedBy: checker`, `disagreement`, `resolvedByChecker`); `--typecheck-max-files` budget (2500); `.vue` importers are outside the Program | **checker**: the compiler's own alias resolution, for TypeScript/JavaScript importers only; skipped with a reason over budget |
| Template components classified | `componentsByResolution` (`local`, `builtin`, `nuxt-metadata`, `catalog`, `package`, `dynamic`, `unknown`), `dynamicComponents[]`, `is="X"` and literals in `:is` resolved | **AST** of the template (compiler-sfc); `unknown` only when nothing explains the name |
| Workspaces (pnpm, npm, yarn) | packages inside the root resolve by name through `package.json` `exports`/`main` (`resolution: workspace`); `tsconfig` project references and per-package `tsconfig.json`; `framework: workspace` at a root without its own framework; siblings of an app are `packageImports[].scope: workspace`, named and never followed; `contracts-check` entries from `package.json`, `package-subpath-not-exported` | **verified**: the file exists at the path the package publishes |
| Exclusions | `exclude` in the config or `--exclude a/**,b` (validated; exit 2 on absolute paths, `..`, backslashes, empty or catch-all patterns); `excluded` block and note in every report, including edges dropped because they pointed at excluded files | explicit: excluded code is not audited and the report says so |
| Dependency policy | `dependencies.allowed` / `dependencies.exceptions`; `forbidden-dependency` (runtime vs type-only), `architecture-exception`, `allowed-cycle` | derived from the edges and their `kind` |
| Next.js | `client-only-in-server`; Server Action modules exempt from `server-env-in-client` | directive prologues from the AST (semantic) or the first statement (lexical) |
| `bundle-budget` scope | `assetScope` (`manifest` / `directory`), `staleFiles`, `staleJsGzipKb`, `unreferencedFiles`, `inventoryComplete`, `buildId`, `otherBuilds`, `sharedChunks`; `stale-build-artifacts` | manifests of the current build; stale only when provable (complete inventory or another build id); nothing is guessed |
| Main-module guard | all seven tools run through symbolic links, relative paths and paths with spaces | `isMainModule()` compares real paths |

### What 1.4.0 adds on top

| Capability | Where | Resolution level it reports |
|---|---|---|
| Static UI audit | `ui-audit.mjs`: elements from the compiler-sfc template AST (`.vue`) or the TypeScript JSX AST (`.tsx`/`.jsx`), with attributes, bindings, events, parents and children; lexical fallback over the template text without parents | `verification: static` (the markup proves it, level confirmed), `review` (heuristic), `browser` (info); `summary.byVerification`, `encapsulatedByComponent`, `unverifiable`, `browserChecks`, `data.files[].source` (`ast` / `lexical`) |
| SSR and hydration rules | `state-audit.mjs`: `browser-api-in-setup`, `nondeterministic-render`, from the AST context of each identifier (enclosing calls, function, guards) | confirmed at the top level of `<script setup>` / module scope with SSR on; heuristic in a React render body; low when `ssr: false`; silent inside lifecycle hooks, handlers, client guards and `.client.` files; never emitted by the lexical engine |
| `definePageMeta` from the AST | `routes-audit.mjs`: `middleware` strings, arrays (comments ignored), identifiers and inline functions (`middlewareUnknown`), `layout`, `redirect`; redirect-only pages (`navigateTo` / `router.replace` with an empty template, or `definePageMeta({ redirect })`) are `status: redirect` with `redirectTo` and `redirectGuarded` (`redirect-page`, info; medium when the target is unguarded) | `summary.metaParser` (`ast` / `lexical`); lexical mode strips comments but keeps strings |
| Type-checker budgets | `domain-deps --typecheck --typecheck-max-files 2500 --typecheck-max-source-mb 20 --typecheck-max-heap-mb 1024`; `analysis.typechecker` records root files, source files loaded, wall ms, CPU ms, heap MB and RSS MB | over budget, or on any failure, the checker is skipped with a reason and the syntactic origins stand; nothing partial is hidden |
| Browser mode | `browser-audit.mjs` (below) | `confirmed` observed in the page, `heuristic` observed but context may justify it, `info` evidence; `verification` is always `browser` |
| Frozen 1.3 behaviour | `verification/tools/baselines/1.3.0/` (finding fingerprints per tool and fixture) and `contracts/1.3.0/` (JSON shapes); a 1.3 finding may disappear or change grade only through `baselines/migrations.json` | test suites, not report fields |

## Static UI audit (1.4.0)

`node ui-audit.mjs <project-root> [--rules a11y,forms] [--exclude …] [--engine …]`. It reads the same graph as the other tools and judges native elements (components are never judged, their inner markup lives in their own file). What it can prove from markup alone is small and it says so with the `verification` field:

| Verification | Level | Examples |
|---|---|---|
| `static` | confirmed | `<img>` with no `alt` attribute at all; `<input>` with no `<label for>`, no wrapping `<label>`, no `aria-label`/`aria-labelledby`; `<div @click>` without role; `role="buton"`; `tabindex="3"`; `<iframe>` without title; `<button aria-hidden="true">`; a focusable element nested in `<a>`/`<button>` |
| `review` | heuristic | an icon-only button whose child is a component that may render a name; a heading jump (h1 → h3); a `<table>` without `<th>`; hover handlers without focus handlers; `aria-invalid` without `aria-describedby`/`aria-errormessage`; a form with a submit handler and no pending-like identifier anywhere in the component; an asterisk in a label without `required` |
| `browser` | info | `:alt`, `:aria-label`, `:id` bound to expressions: the rendered value decides |

Names come from content: text or interpolation anywhere inside a `<button>` (a nested `<span>`, a `<div>` of lines) counts as its name, and a component anywhere inside makes the absence of a name `review`, not `static`. A click handler makes an element interactive only when it does something: `@click.stop` or `@click.prevent` with no expression, or a handler that only calls `stopPropagation()`/`preventDefault()`, is event plumbing and is never reported; a handler that only focuses an inner control (`@click="input?.focus()"`) is `review`. A control with the HTML `hidden` attribute is skipped; one hidden by a class that usually means display:none (`hidden`, `d-none`, `display-none`, `is-hidden`) without a label is a `browser` check (the typical hidden `<input type="file">` behind a visible button). These four rules came from reading every static finding on an 80k-line Nuxt application (`docs/ui-verification.md`, *Calibration on real code*).

Encapsulation: a control inside a custom component that declares a label-like prop (`label`, `aria-label`, `title`, `legend`, `name`, static or bound) is counted in `encapsulatedByComponent` and not reported; a spread (`v-bind="$attrs"`, `{...props}`) makes the element `unverifiable` (counted, not reported). The lexical engine has no parent chain: findings that need it (wrapping labels, nesting) degrade to `review`, facts provable from the attributes alone stay `static`, JSX is not scanned, and the note says so. Passing this audit is not WCAG conformance: contrast, reading order, timing, media alternatives and real accessible names need the browser pass and human review (`references/ui-verification.md` lists the human criteria).

## Browser mode (1.4.0)

`node browser-audit.mjs <url> --playwright <dir> [--checks …] [--paths …] [--viewports …] [--text-scale …] [--interact] [--allow-submit] [--allow-host …] [--out …] [--screenshots] [--baseline-dir …]`. Everything below is enforced by the tool and covered by tests, not only documented:

- **Nothing runs unless you hand it a browser.** `--playwright <dir>` is mandatory: a directory whose `node_modules` provides `playwright` (and `axe-core`, or `--axe`). The plugin installs nothing and bundles no browser; `verification/browser/package.json` pins the versions the fixture was validated with.
- **Only hosts you allow.** `localhost` and `127.0.0.1` by default; anything else needs `--allow-host`. Every other request the page makes is blocked at the network layer and listed in `data.blockedRequests`. Production is never a default and never a recommendation.
- **No automatic login, no credential forms.** A login wall is reported as `auth-required` and the page is skipped; the tool never receives credentials, and a form that contains a password field is never submitted even under `--allow-submit` (`form-skipped-credentials`: no sign-in attempts, no lockouts, no accounts created).
- **No form submission without `--allow-submit`** (the `forms` check refuses to run without it). `--interact` clicks `type="button"` controls to discover dialogs and menus, never those whose name matches delete, remove, destroy, pay, purchase, buy, send, submit, confirm, archive, publish, reset, revoke, logout or their Spanish equivalents. Values typed into forms are marked (`Audit value`) and never appear in the report.
- **Budgets.** `--max-time` (90 s) and `--max-pages` (10); when the budget runs out the remaining pages are listed as not visited.
- **Evidence only where you say.** `--out` and `--baseline-dir` must be under the working directory, the OS temp dir or `/tmp` (symlinks resolved, path segments compared, so a sibling directory sharing the prefix is rejected; default `--out` is a new temp directory); the report `browser-audit.json` and, only with `--screenshots`, masked PNGs go there; the baseline directory is created only when a baseline is actually written. Elements matching `--mask` (default `input[type=password],[data-sensitive],[data-fa-mask]`) are blacked out in screenshots, and their text, value, label, title and placeholder are replaced by `[masked]` in every message, evidence string, page title and console line of the report (best effort: names truncated by the tool are matched on their first 60 characters).

| Check | Findings | Level |
|---|---|---|
| `axe` | `axe-<rule>` for impact critical and serious; `axe-needs-review` for the rest | confirmed / info |
| `keyboard` | `keyboard-unreachable` (visible focusable elements never reached by Tab in document order), `hover-only-disclosure` (a `:hover` rule of the page's stylesheets reveals content with no `:focus`/`:focus-within` equivalent) | heuristic |
| `dialogs` | `dialog-focus-not-moved`, `dialog-focus-not-restored` (confirmed); `custom-modal-without-dialog-role`, `dialog-escape-does-not-close` (heuristic); triggers are buttons with `aria-haspopup`/`aria-controls`, plus any non-destructive button with `--interact` | confirmed / heuristic |
| `forms` (needs `--allow-submit`) | `form-double-submit` (confirmed: two quick clicks on submit sent two or more requests), `form-no-validation-feedback`, `form-error-not-associated`, `form-focus-not-moved-to-error`, `form-no-pending-state` (button neither disabled nor `aria-busy` while the request was in flight), `form-no-success-feedback` (no `role="status"`/`aria-live` region changed and no navigation) | confirmed / heuristic |
| `responsive` (per viewport and text scale) | `horizontal-overflow` naming the culprits (elements inside an `overflow-x: auto|scroll` ancestor or marked `data-allow-overflow` are never culprits), `control-cut-off`, `control-covered` (another element sits on top of a control at its centre), `dialog-exceeds-viewport`, `navigation-unreachable` | confirmed |
| `hydration` | `hydration-mismatch` (the framework logged a hydration warning or error; confirmed), `client-only-rendered-content` (five or more words exist only after client rendering, comparing the server HTML text, scripts and styles excluded, with the hydrated DOM; info) | confirmed / info |
| `visual` (needs `--baseline-dir`) | `visual-baseline-missing`, `visual-baseline-written`, `visual-environment-mismatch`, `visual-regression`, `visual-difference-accepted`, `visual-compare-failed` | info / confirmed |

Visual baselines are one PNG plus one JSON per page and viewport (browser name, version and platform, Node and Playwright versions, viewport, device scale factor, reduced-motion and animation settings, generation time). They are written only with `--write-baseline` (when none exists) or `--approve <page@viewport,…>`; a run never updates an approved baseline on its own; without a baseline the screenshot is saved as a candidate under `--out` and reported as `visual-baseline-missing`. Animations are disabled, fonts awaited, `prefers-reduced-motion: reduce` emulated and `--freeze-time` fixes `Date`; when the baseline's browser name, major version, platform or viewport differs from the run, the status is `environment-mismatch` and no regression verdict is given. Differences above `--visual-threshold` (ratio of differing pixels, default 0.001) are `visual-regression` with bounding boxes; below it, `visual-difference-accepted`. The PNG codec is in `lib/png.mjs` (zero dependencies).

Passing axe-core and these checks is not WCAG conformance. Reading order, the meaning of alternatives, timing, cognitive load, error prevention and most of the "understandable" criteria need a person; `references/ui-verification.md` lists them. The fixture that proves each finding fires, and does not fire on the correct page, is `verification/browser/fixture/` (served locally by `server.mjs`); `verification/browser/browser-audit.test.mjs` runs it in CI with Chromium.

## Public routes (routes-audit)

A page needs no guard when `publicRoutes` in the config matches it, or when its route starts with one of the generic names the tool treats as public by default: `auth`, `login`, `logout`, `register`, `signup`, `signin`, `sign-in`, `sign-up`, `callback`, `forgot-password`, `reset-password`, `verify-email`, `forbidden`, `no-access`, `unauthorized`, `suspended`, `maintenance`, `error`, `403`, `404`, `500`. Anything specific to a product (a public status page, a legal page, a kiosk route) goes in `publicRoutes`; the default list carries no project names.

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
    "sales": ["app/components/sales/**", "app/pages/sales/**", "app/composables/useSales.ts", "app/types/sales.ts"],
    "projects": ["app/pages/projects/**", "app/composables/useSchedule.ts"]
  },
  "shell": ["app/layouts/**", "app/middleware/**", "app/plugins/**", "app/pages/index.vue"],
  "shared": ["app/components/ui/**", "app/utils/**", "app/composables/useApi.ts"],
  "coreDomains": ["auth", "organizations"],
  "coreStores": ["auth", "ui"],
  "publicRoutes": ["app/pages/auth/**"],
  "authPatterns": ["requireUser(", "assertCan("],
  "excludeTests": true,
  "exclude": ["infra/**", "vueform.config.ts"],
  "dependencies": {
    "allowed": [["projects", "sales"], ["people", "sales"]],
    "exceptions": [{ "from": "sales", "to": "projects", "reason": "project client lives in sales until PR 4", "since": "2026-10-27", "until": "PR 4" }]
  },
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
- `exclude` (1.3): project-relative globs (or bare directories) left out of every tool; invalid patterns stop the tool; the report lists what was excluded. `--exclude a/**,b` adds patterns from the command line.
- `dependencies` (1.3): `allowed` pairs `[from, to]` between business domains and `exceptions` with `reason`, `since`, `until`. With it, pairs outside the list are `forbidden-dependency` (runtime file pairs high, type-only low), excepted pairs are `architecture-exception` (info, with current counts) and a cycle allowed in both directions is `allowed-cycle` (info). Without it the matrix is descriptive only.

## What the tools do not do

- They do not type-check by default. The semantic engine parses syntax trees and resolves modules with the project's TypeScript; barrels and `export *` are followed syntactically (`origins`), dynamic specifiers stay unresolved. `domain-deps --typecheck` adds the compiler's alias resolution for TypeScript/JavaScript importers, within a file budget; it is still not a type-level audit of the code. The lexical fallback blanks comments and strings before matching and can still miss or over-match on unusual formatting; the `Analysis` line says which engine produced a report.
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
