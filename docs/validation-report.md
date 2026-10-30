# Validation report

Date: 2026-10-28. Environment: macOS (Darwin 27), Node 22.23, npm 10.9, pnpm 10.15, Python 3.13, Claude Code CLI 2.1.312, nginx not installed.
Commands: `./verification/run-all.sh` plus the checks listed separately below. The previous report (2026-10-17, Ubuntu, 1.0.0) is superseded; its results for unchanged checks were reproduced here.

## Versions under test (installed, not assumed)

nuxt 4.6.x · vue 3.5.44 · pinia 4.1.0 · @pinia/colada 1.4.8 · @pinia/colada-nuxt 1.2.0 · pinia-plugin-persistedstate 4.7.1 · next 16.4.x · react 19.3.x · @tanstack/react-query 5.10x · zustand 5.0.x · axios 1.2x · zod 4.6 · three 0.186.1 · @tresjs/core 5.x · @react-three/fiber 9.8.x · gsap 3.15.0 · lenis 1.3.27 · typescript 5.9 (verification projects) · vitest 5.0.5 · dependency-cruiser 18.x.

## Results

| # | Check | Result |
|---|---|---|
| 1 | `verification/plugin-check.mjs`: manifests in sync (1.1.0), both SKILL.md frontmatters and line budgets (frontend-architect 166 lines, creative-frontend 89), 38 + 11 references linked both ways, cross-references resolvable, 7 scripts documented and executable, 63 `@verify` markers consistent, 43 eval cases well formed | Pass, 0 warnings |
| 2 | Audit scripts: `node --test verification/tools/*.test.mjs` against the Nuxt 4 and Next.js 16 fixture apps, including the `.nuxt` metadata suite (verified vs inferred edges, stale entries, package and unknown symbols), the server-data-copied-to-store rule, absolute `--config` paths and a 64 KiB+ JSON output piped through stdout | 31/31 pass (23 in the first 1.1.0 run) |
| 3 | 90 code blocks extracted from the references into 5 projects (`extract.mjs`; 58 in 1.0.0, 79 before stabilization) | OK |
| 4 | Vue project: `tsc` strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`) | Pass |
| 5 | Vitest (vue): HTTP errors and single-flight refresh, contract validation, cart store, persisted state, UI-state union, server-error mapping, error → UI mapper, stale-response guards (`latest`, `latestOnly`, `singleFlight`), tenant-scoped state, forbidden handler, logout protocol, identity epochs (late responses dropped after logout or tenant switch), public-user serialization | 14 files, 31/31 tests pass |
| 6 | React project: `tsc` strict (HTTP provider, TanStack Query hooks, Zustand persist with migration, R3F components) | Pass |
| 7 | Next.js 16.4: `tsc` and `next build` (Server Function with `useActionState` and `updateTag`, HMAC webhook Route Handler, `proxy.ts`) | Pass, 5 static pages |
| 8 | Nuxt 4.6: `nuxt prepare` + `check-layers.mjs` (7 assertions on the generated types: the `layers/base` layer registers `BaseTag`/`LazyBaseTag` and `useLayerInfo` from the layer path, `runtimeConfig.public.layerName` and the merged `app.config` are typed) + `nuxt typecheck` (Axios and `$fetch` plugins, `useApiFetch`, Pinia Colada composables, generic `UiSelect`, `UserList.vue`, TresJS 5 components, `LayerDemo.vue`) | Pass, 7/7 |
| 9 | Creative project: `tsc` strict (GSAP context + matchMedia, Vue composable, `@gsap/react`, Lenis + ScrollTrigger, Three.js scene, ShaderMaterial, cleanup stack) + Vitest (Three.js `disposeObject` disposes every geometry, material and texture; cleanup stack runs once, newest first, isolates errors) | Pass; 2 files, 6/6 tests |
| 10 | SSR runtime: production Nuxt build + mock backend on free ports; 40 concurrent requests from 20 sessions over 3 tenants, every 7th request slowed by 1.2 s; each page must contain only its own user+tenant pair and the layer component | Documented pattern: **40/40 correct, 0 leaks, 6/6 slow requests correct, layer rendered 40/40** |
| 10b | SSR negative control (`run.sh --negative`): the module-level-client anti-pattern is installed, rebuilt and must leak; sources restored afterwards | **39/40 responses leaked another user's data**: the test detects the bug it claims to detect |
| 11 | dependency-cruiser rules from `folder-structure.md` on the fixture | Both intentional violations reported |
| 12 | Nginx reverse-proxy example | **Skipped** (nginx not installed on this machine; unchanged since the 1.0.0 run that passed `nginx -t`) |
| 13 | `claude plugin validate` (marketplace and plugin) | Pass (one informational warning: no plugin icon) |
| 14 | `claude plugin eval` (43 scenarios) | **Not run** (requires an authenticated account); structure validated by item 1 |

Wall time of `./verification/run-all.sh` on this machine: 28 s (dependencies pre-installed).

## Context cost of the skills (measured, not estimated)

Method: the plugin installed from the local marketplace at user scope (`claude plugin marketplace add ./`, `claude plugin install frontend-architect@frontend-architect --scope user`) and `claude plugin details frontend-architect@frontend-architect` run before and after the SKILL.md restructuring of the stabilization pass, same CLI (2.1.312). `plugin-check.mjs` prints a chars/4 estimate as a secondary signal.

| Component | Always-on before → after | On-invoke before → after |
|---|---|---|
| `frontend-architect` skill | ~250 → ~230 tokens | ~5.1k → ~2.7k tokens |
| `creative-frontend` skill | ~210 → ~180 tokens | ~2k → ~2k tokens |
| `frontend-reviewer` agent | ~160 → ~170 tokens | ~1.3k → ~1.3k tokens |
| Plugin total always-on | ~623 → ~580 tokens | |

What changed: the full reference catalog (38 rows) moved to `references/index.md`; `SKILL.md` keeps the workflow, the stage table, the task → references selection table, a defaults table that condenses the former "core decisions" prose, the rules and a one-paragraph list of the seven scripts. The two descriptions were shortened without removing trigger terms (`frontend-architect` 1,022 → 934 characters; `creative-frontend` 837 → 706). The chars/4 estimate of `SKILL.md` went from ~5,390 to ~2,930 tokens. Nothing was removed from the references themselves.

## Field validation on real code (read-only, stabilization pass)

Two local Nuxt 4 applications, not modified. Classification files lived in `/tmp`, never in the projects. Confidence is the tools' own label: **verified** = an explicit import or an auto-import resolved by the project's `.nuxt/types/imports.d.ts` / `.nuxt/components.d.ts`; **inferred** = resolved only by the lexical catalog; findings keep the level the tool assigned. Mechanism = how the dependency or defect was detected. Every row was read in the source before being listed here.

**Application A: Nuxt enterprise application (Nuxt 4.4, `ssr: false`, 288 source files, ~80k lines, flat auto-imported composables; `.nuxt` present from `nuxt dev`).** Classification: seven business domains grouped from the folder names plus shell and shared.

| Tool | Result | Confidence / level |
|---|---|---|
| `domain-deps` | 1,488 edges: 488 imports, 582 auto-imports, 418 template components. **All 1,488 verified** through the generated metadata (`catalogSource: nuxt-metadata+lexical`); 302 symbols and 236 components resolved; 2 unknown symbols; 30 package-provided symbols used | measured |
| `domain-deps` | Horizontal coupling dominated by two files: one domain types file (25 and 16 imports from two other domains) and one domain composable (9 and 5 auto-imports), the same two files the manual audit of this app had identified as a misnamed core | verified edges; interpretation demonstrated by reading the files |
| `domain-deps` | `shared-imports-domain` ×14, e.g. the HTTP client composable imports a pagination type from a domain types file; a formatters composable imports status enums from two domain type files; three root components use domain composables or render a domain component | confirmed (verified edges) |
| `domain-deps` | `shell-depends-on-domain` ×20 (layout, middleware and shell pages using one domain's permission checks and domain clients); `domain-cycle` ×7 between business domains; eight hotspots used by 7–9 domains (the auth store, the error utilities, loading and error state components, list-state composables, pagination, text utilities: the de facto shared core) | confirmed / heuristic as labeled |
| `component-complexity` | 205 components, 67,910 lines, median 245; 55 files ≥ 400 lines, largest page 2,766 lines; 8 with mixed responsibilities, 19 god templates | heuristic |
| `state-audit` | `token-in-web-storage` ×2 in the auth store (access and refresh tokens written to `localStorage`); 17 `useState` keys; 26 module-level mutable states reported as low because `ssr: false`; 3 logout paths without visible cache clearing; 1 god store | confirmed / heuristic as labeled |
| `routes-audit` | 83 pages: 65 guarded by the `auth` middleware, 8 public by classification, 10 without any guard; one global middleware that is not an auth guard | heuristic (declared guards only) |
| `leak-patterns` | 21 files with tracked resources; 2 candidates (an observer and a listener without visible cleanup) | heuristic |
| `contracts-check` | 0 modules: the app has no `features/`/`modules/` layout, so there are no contracts to check yet | measured |
| `bundle-budget` | Startup assets from `client.precomputed.mjs`: entry JS 148.2 KB gzip, entry CSS 37.4 KB, total JS 1,457.8 KB gzip, largest chunk 264.5 KB gzip | measured |

**Application B: Medical SaaS (Nuxt 4.6, Pinia 4 + Pinia Colada + Nuxt UI, `app/features/*` with public entries, 151 files).** Classification by convention plus `coreDomains: [auth, organizations]`.

| Tool | Result | Confidence / level |
|---|---|---|
| `domain-deps` | 473 edges, all explicit imports, all verified; `.nuxt` metadata present but older than the sources (note emitted); 1 unknown symbol, 23 package-provided | measured |
| `domain-deps` | `shell-depends-on-domain` ×2: the panel layout imports two route helpers from two feature entries. Read: navigation links built from published path helpers, an accepted pattern; the finding is correct as a dependency and benign as a design | confirmed (verified edges); benign on reading |
| `contracts-check` | 5 modules, 5 with `index.ts`, 0 internal imports, 311 public exports of which 200 are not imported from outside (large public surface to prune) | measured / info |
| `routes-audit` | 16 pages, all protected by two global middlewares (`auth`, `organization`), `/app/**` client-only by route rules | heuristic |
| `state-audit` | `token-in-web-storage` ×1 downgraded to low: it lives in a fake auth adapter used as a test double for Playwright; 13 module-level states (low, `ssr: false`); query cache detected (`@pinia/colada`) | confirmed, low |
| `leak-patterns` | 3 candidates: 2 listeners, 1 subscription without visible cleanup | heuristic |
| `bundle-budget` | Entry JS unknown (static `.output` without manifest or rendered HTML; `--html` accepted), entry CSS 26.5 KB gzip, total JS 379.1 KB gzip | measured |

Defects fixed during this pass because of these runs: `--config` with an absolute path was joined to the project root (fixed, tested); `--json` outputs above 64 KiB were truncated when piped because the tools called `process.exit` before stdout drained (fixed in all seven tools, tested with a synthetic 600-edge project). No Next.js application exists on this machine; the Next.js paths were exercised only through the fixture and the `verification/next` harness.

## Audit scripts on real code (first 1.1.0 run, read-only)

Two local Nuxt 4 applications were used as smoke targets without modifying them. Numbers are what the tools printed; each tool finished in well under one second.

| Target | Tool | Output |
|---|---|---|
| Nuxt enterprise application, 287 source files, 80,786 lines under `app/`, flat auto-imported composables, `ssr: false` | `domain-deps` (no config) | 1,534 edges: 628 through auto-imports, 418 through template components, 488 explicit imports; 302 auto-import symbols and 118 components resolved; 101 files unclassified by convention (flat composables), which is exactly what `.frontend-audit.json` is for |
| same | `state-audit` | 1 Pinia store, 17 `useState` keys, 7 web-storage writes; 2 confirmed token-in-web-storage; 26 module-level state candidates reported as low severity because `ssr: false` |
| same | `routes-audit` | 83 pages: 66 guarded, 7 public, 10 without a guard (the app's own audit from the day before had found the same set) |
| same | `leak-patterns` | 21 files with tracked resources; 2 potential leaks |
| same | `bundle-budget` | Startup assets read from `client.precomputed.mjs`: entry JS 148.2 KB gzip, entry CSS 37.4 KB gzip, 1,457.8 KB gzip total JS, largest chunk 264.5 KB gzip (matches the hand-measured 147 KB from the manual audit) |
| Medical SaaS, 151 files, `app/features/*` layout, Pinia Colada | `domain-deps` (no config) | 471 explicit import edges; features, shell and shared classified by convention; 8 shell→domain findings for `auth`/`organizations` (then suppressed by `coreDomains`) |
| same | `routes-audit` | 16 pages, all protected by two global middlewares |
| same | `state-audit` | 1 confirmed token-in-web-storage downgraded to low because it lives in a fake auth adapter (a test double) |

Defects found and fixed by these runs before shipping: `logout` detection matched any mention of the word (12 false positives in one app); a global `tenant` middleware was taken for an auth guard; `let x = null` at module scope was skipped; Nuxt 4 node-server builds keep the client manifest in `client.precomputed.mjs`, so entry detection by file name reported 0 KB.

## 1.2.0 addendum: semantic engine (2026-10-28, same machine)

Compilers under test: `typescript` 5.9.3 and `vue/compiler-sfc` 3.5.44 from `verification/vue` (lent to the fixtures, which ship no `node_modules`); on the real projects, their own installations (`typescript` 6.0.3 with `vue/compiler-sfc` 3.5.34 reached through the `nuxt` package in a pnpm layout; `typescript` 5.9.3 with `vue/compiler-sfc` 3.5.44 at the root). The TypeScript 7 shape (a `typescript` package without the JavaScript API) is exercised with a synthetic package in the tests.

| # | Check | Result |
|---|---|---|
| 15 | `node --test verification/tools/*.test.mjs`: the 31 suites of 1.1 plus `semantic-engine.test.mjs` (ground-truth equality including dependency kinds, engine selection and fallback reasons, TypeScript-7 rejection, Nuxt `paths` and `.nuxt` metadata interplay, Next `server-only-in-client` / `server-env-in-client` with a negative control, SFC metrics from compiler bindings, AST-based cleanup detection, type-only severity in `contracts-check`, JSON contract of the six tools) | **42/42 pass** |
| 16 | Ground truth `verification/tools/fixtures/ts-paths/expected-edges.json` (19 edges written before the run) | semantic: precision 100%, recall 100%, kinds exact; lexical: precision 100%, recall 57.9% (8 alias and barrel edges missed, including the edge that closes a domain cycle) |
| 17 | `verification/tools/benchmark.mjs` on the three fixtures and on two real projects (`docs/benchmarks.md`) | Semantic 4–6× slower and 5–11× more heap than lexical; under 1 s and 141 MB on the 294-file app |
| 18 | Nuxt enterprise application (294 files), all six graph tools with both engines, read-only | Same findings except: 3 lexical false-positive auto-import edges removed (helper names used as property names and object keys; mechanism in `docs/benchmarks.md`), one `domain-cycle` upgraded to `confirmed`, 9 `unresolved-import` info entries (an infrastructure sub-package without `node_modules`, an uninstalled form library), 3 `god-template` flags changed by the AST template depth |
| 19 | Medical SaaS (151 files), same procedure | Same findings except one `god-template` flag (lexical depth 13 vs AST depth 9); 6 additional type edges to the generated API schema declaration file with no finding |
| 20 | Audited projects unmodified | `git status` clean in the enterprise application; the medical SaaS shows one modified file, `.claude/settings.json` (plugin enablement, last written 14:44, before any tool of this pass ran; the tools open files read-only) |
| 21 | Real Next.js project | **None available on this machine**; the React/Next adapter is validated on the fixture only (`OrderAdminPanel.tsx` reaches `server.ts` and `secrets.ts`; `OrderBadge.tsx` importing a pure helper produces no finding) |
| 22 | `verification/plugin-check.mjs` (manifests 1.2.0, 54 eval cases), `claude plugin validate`, `git diff --check` | See the final section of the 1.2.0 report in `CHANGELOG.md`; re-run before publishing |

## 1.3.0 addendum: audit reliability and deeper semantics (2026-10-29, same machine)

Baseline before any change: HEAD `06ff657` (1.2.0), 42/42 tests, `plugin-check` and `run-all.sh` green, clean tree. Each of the four defects reported after the 1.2.0 publication was reproduced with a fixture before it was fixed: a tool reached through a symbolic link printed nothing and exited 0 (also through `/tmp`, a path with a space and a relative path from another directory); `bundle-budget` summed two builds present in one `.output`; an `exclude` key in the configuration was ignored without a note; `component` and `transition` were listed as unknown components by the semantic engine.

| # | Check | Result |
|---|---|---|
| 23 | `node --test verification/tools/*.test.mjs`: the 42 suites of 1.2 plus `defects-1.3` (symlinks with spaces and relative paths for all seven tools, two-build Nuxt output, Next `BUILD_ID` leftovers, no-manifest scope, exclusions from config and CLI, invalid patterns, the `vue-templates` truth), `compat` (37 shape snapshots of the 1.2.0 JSON reports), `symbols`, `monorepo`, `policy`, `next-boundaries`, `typecheck`, `read-only` | **82/82 pass** |
| 24 | Ground truths written before the engines ran: `ts-paths` (19 edges, 18 symbol origins), `vue-templates` (6 edges, 1 unknown, 3 dynamic components, a file whose component mentions are all comments or strings), `monorepo` (11 edges, 4 symbol origins including a name no file declares, package scopes, contracts) | semantic 1.3: precision and recall 100% on the three; symbols 18/18 and 4/4. Lexical: 57.9%, 66.7% (one false positive from an HTML comment), 36.4% recall. The archived 1.2.0 scripts on the same fixtures: `vue-templates` recall 66.7%, `monorepo` 36.4% with 8 unresolved imports, symbols 0/18 and 0/4 (`docs/benchmarks.md`) |
| 25 | `verification/tools/benchmark.mjs --baseline` (1.2.0 scripts from `git archive 06ff657`, warm-up before timing) | 1.3 semantic costs 10–40% more time than 1.2 on the fixtures (symbol origins, component classification), under 1 MB more heap; 3–6× the lexical time on the real projects |
| 26 | JSON contract: every key path of the 1.2.0 reports of the seven tools on the fixtures (37 snapshots under `verification/tools/contracts/1.2.0/`) | all present with the same type in 1.3; additions only. One semantic change documented: `bundle-budget.totalJsGzipKb` excludes provably stale assets (reported separately) |
| 27 | Read-only guarantee: static scan of the scripts (no process execution, network, writes except the documented `--write-baseline`) and a byte-identical fixture after running every tool with the semantic engine; `bundle-budget` refuses to build | pass |
| 28 | Nuxt enterprise application (305 files, pnpm, `typescript` 6.0.3 and `vue/compiler-sfc` 3.5.34 from the project), read-only, clean tree before and after | semantic: 1,540 edges, all verified; unknown components 3 → **1** (the special elements are now built-ins; the remaining one is a component name the installed UI library does not register); 1,004 import names resolved to their declaring file (57 through barrels, 2 not found); `--follow-reexports` adds 57 edges; `contracts-check` describes the six module entries as publishing 49 names declared outside the modules tree, the expected state of barrels created before the files move; 0.48 s, 82 MB |
| 29 | Medical SaaS (153 files, `typescript` 5.9.3, `vue/compiler-sfc` 3.5.44), read-only | semantic: 492 edges; 1,135 import names, all placed (188 through barrels, 7 in a generated declaration file); the first run reported 28 not found, all default exports of `.vue` components re-exported by feature barrels, fixed before shipping; `--follow-reexports` adds 160 edges; `contracts-check`: 314 public exports, 203 never imported from outside |
| 30 | Next.js reference project built by the harness (`verification/next`, `next build` with Turbopack), audited after the build with its own TypeScript (`check-audit.mjs`) | semantic engine, every edge verified, no `server-only-in-client` or `client-only-in-server`, Server Function and Route Handler inventoried, `.next` measured through its manifests with `BUILD_ID`. This run found and fixed a false `server-env-in-client` (a client component importing a `'use server'` module) and an over-eager stale classification under Turbopack (now `unreferenced`, measured) |
| 31 | `plugin-check.mjs` (manifests 1.3.0, 66 eval cases), `claude plugin validate` (marketplace and plugin), `git diff --check`, privacy scan of every new or modified file | pass; no client names, private paths or emails |
| 32 | `./verification/run-all.sh` (plugin-check, 82 tests, symlink step, benchmark gate, extraction, five compilers, Next reference audit, Nuxt layers and typecheck, SSR tests, dependency-cruiser) | **Pass** (exit 0; 82/82 tests, the symlink step and the benchmark gate included; Vitest 31/31 and 6/6; SSR 40/40 correct and the negative control leaking as expected; Next reference audit passed) |

Not run in this pass: paid evaluations (cases 49–66 have no scores); the TypeScript Program on the real projects (opt-in, measured only on the fixtures: 150–175 ms and 40–48 MB for a dozen files); a real Next.js project (none on this machine).

## 1.4.0 addendum: UI quality, accessibility, visual verification, runtime diagnostics (2026-10-29, same machine)

Versions under test: Node 22.23.4; the verification `vue` project's TypeScript and `vue/compiler-sfc` for the fixtures; Playwright 1.64.1 with its Chromium build and axe-core 4.14.0 pinned in `verification/browser/package.json` (installed only there; the plugin ships none of it).

| Check | Result |
|---|---|
| 1.3 debt D1 (`routes-audit` with a commented middleware array and redirect pages): reproduced on the Nuxt fixture before the fix (`unknown-middleware` for `'    '`, redirect pages as unguarded), fixed by the AST page-meta parser and the string-preserving lexical fallback; positive controls (a wrong name stays confirmed, a redirect to an unguarded page is medium, a handler that navigates stays unguarded) | 4/4 tests, both engines |
| 1.3 debt D2 (`--typecheck` cost): measured read-only on the two calibration projects (`docs/benchmarks.md`); budgets for files, source size and heap; CPU and RSS in `analysis.typechecker`; the declaration-file disagreement bug found by the measurement and fixed | measured, no budget triggered |
| 1.3 debt D3 (freeze before change): 61 JSON shapes and 61 finding baselines of 1.3.0 captured before any 1.4 change; `baseline-findings.test.mjs` fails on any removed or re-graded 1.3 finding without a migration entry | `migrations.json` 1.4.0: empty |
| Static UI audit on `ui-app` (truth of 30 findings written first): semantic engine | precision 100%, recall 100%; clean files clean; 1 encapsulated, 3 browser-only |
| Static UI audit, lexical degradation | measured (`docs/benchmarks.md`): 77.8% precision, 70% recall, JSX not scanned, note present |
| SSR rules on `ssr-app` (truth of 5) and the Next.js fixture (`WindowInRender` reported heuristic, `WindowInEffect` clean), `ssr: false` copy at low severity, lexical silent | exact match |
| Browser mode on the fixture (six pages, three viewports, two text scales, interact, submissions, screenshots) | every must-have present, every must-not-have absent, intentional scroller never a culprit, `form-double-submit` proven by the counting server, masked card number absent from the report, 18 screenshots under `--out`, about 25 s |
| Browser mode refusals (no tooling, remote host, forms without consent, output outside allowed paths) | exit 2 with the reason, each |
| Visual regression lifecycle (missing → candidate; `--write-baseline`; identical → match; altered platform → environment mismatch, no verdict) | pass |
| Read-only guarantee: static scan (browser exception bounded to `--out` writes; no static tool imports browser tooling; PNG codec depends on `node:zlib` only); byte-identical Nuxt fixture after every static tool including `ui-audit` | pass |
| `node --test verification/tools/*.test.mjs` | 99/99 |
| `verification/browser/browser-audit.test.mjs` (`FA_REQUIRE_BROWSER=1`) | 3/3 |
| `plugin-check.mjs` (references linked, 9 scripts documented and executable, 77 eval cases well formed) | pass |
| Benchmark CI row (`ts-paths` semantic 19/19) unchanged; new rule-level section | pass |
| Evals 67–77 | structure validated; not run (no paid run authorised) |
| Static UI audit on real code (read-only): Nuxt enterprise application, 210 files, 9,002 elements; every static finding of the first run read | first run 52 static; four false-positive patterns found (nested-text buttons 15, `@click.stop` plumbing 7, focus delegation 1, hidden file inputs 14) and fixed with negative controls in the fixture; after calibration 15 static (clickable rows and divs, all true by reading), 12 review, 33 browser, 11 encapsulated, 12 unverifiable |
| Static UI audit on real code: Medical SaaS, 68 files, 1,338 elements | 0 static, 2 review (pending flag not visible), 0 browser |
| SSR rules on real code (both apps are `ssr: false`): enterprise app 7 `nondeterministic-render` (`new Date` in render, low); medical SaaS 4 `browser-api-in-setup` at module scope of auth files and 3 `nondeterministic-render`, all low as "blocks enabling SSR" | plausible by reading the listed lines; no confirmed-level finding is possible with `ssr: false`, by design |
| `routes-audit` on real code after D1: enterprise app 84 pages, `metaParser: ast`, 77 guarded, 0 unguarded, 0 redirect pages, no findings; medical SaaS 16 pages, `metaParser: ast`, no findings | consistent with the 1.3 results |
| Browser mode against a real application | not run in this pass (needs the owner's authorisation and a served build) |

### Universality review before publication (2026-10-30)

A bounded audit of the public tree for coupling to the calibration projects, with the browser mode re-reviewed and both tools run on the generic reference apps of `verification/`.

| Check | Result |
|---|---|
| Private identifiers in tracked files (client names, project paths, user paths, emails, account names) | none |
| Rules, defaults or code paths in the scripts that name a business, a route, a component or a config of a real project | none: domains, shell, shared, public routes and policies come only from the audited project's `.frontend-audit.json` or `--suggest-config`; the only built-in vocabularies are framework names, Node built-ins, ARIA lists, pending-flag synonyms and the destructive-button words of browser mode |
| Names borrowed from a calibration project in public artifacts | found in `assets/frontend-audit.example.json` (composable and route names), in the synthetic fixtures `nuxt-app` and `vue-templates`, and in the eval 39 scaffold; replaced by sector-neutral English names (sales, projects, documents, people, catalog, feature flags). The code was synthetic before and after; only names changed |
| Frozen snapshots after the rename | `contracts/1.2.0` and `contracts/1.3.0` shapes and `baselines/1.3.0` findings regenerated by running the released 1.2.0 (`06ff657`) and 1.3.0 (`4f00165`) scripts on the renamed fixtures; 1.4.0 regenerated with the current scripts; the diff contains name changes only |
| Sector examples in references and evals (`patients`, `orders`, "clinical, financial") | kept: generic multi-sector examples of frontend practice (branded ids, tenant keys, idle lock in sensitive apps), not rules of one business; the eval prompts about a clinic or a dispatch board are synthetic scenarios |
| Static UI audit on the generic Nuxt reference app (8 files, 33 elements) and Next reference app (9 files, 24 elements), `--engine auto` with their own TypeScript | Nuxt: 1 `browser` check (bound `id` on a select); Next: nothing; SSR rules and routes: nothing |
| Browser mode on the generic Nuxt reference app served from its production build with the mock backend (`--interact --screenshots`) | 1 page, 4 axe findings about the reference shell itself (`document-title` and `html-has-lang` serious; one-main and heading-one best practice), no hydration warnings, 0 blocked requests, 3 screenshots |
| Browser mode on the generic Next.js reference app (`next start`, `/` and `/users`) | 1 best-practice axe finding; with `--checks forms --allow-submit` the first run reported the documented `RenameUserForm` with `form-double-submit` confirmed, `form-no-pending-state`, `form-error-not-associated`, `form-no-success-feedback`. Reading the example and the tool showed a mixed cause: the example already locked the button while pending, but the Server Action answers in about 15 ms without a session, so the tool read the button after the response and counted two sequential submissions as concurrent; `role="alert"` changes were not counted as feedback, and an alert referenced by `aria-describedby` was called unassociated because the field lacked `aria-invalid`. Fixed on both sides: the tool now distinguishes concurrent (confirmed) from sequential (heuristic) double submissions, samples the pending state while the request is in flight, counts alerts as feedback, accepts association through any control, detects native validation through `validity`, and asks for focus on a field only for field-level errors; the example marks the field `aria-invalid`, moves focus back to it, locks the form with `aria-busy` and confirms success in a `role="status"` region. `verification/next/check-browser.mjs` serves the built reference app and asserts it passes (pending `locked while in flight` at 15 ms, feedback present, no confirmed double submission); it runs in `run-all.sh` and CI. Remaining heuristic on the example: two sequential submissions after a fast response, reported with the explanation that a fast server is not protection on a slow network |
| Browser mode safety re-review | `--playwright` mandatory (exit 2); target and every request restricted to localhost unless `--allow-host`; no cookies, storage state or credentials; forms submitted only with `--allow-submit`, and never when they contain a password field (new); `--interact` never clicks destructive names; `--out` and `--baseline-dir` validated (new for the baseline directory, path-segment and symlink aware) and the baseline directory created only when writing (new); masked text replaced by `[masked]` in every evidence string, title and console line (new); nothing written into the audited application |
| Suites after the review | static 99/99 (a regression test for the generic public-route defaults added), browser 3/3 (refusals now include `--baseline-dir` and a sibling-prefix directory; the fixture gains `login.html`, never submitted, and a masked unreachable control), `plugin-check` pass |

## 1.4.1 addendum: browser-audit reliability and accessibility corrections (2026-10-30, same machine)

Corrective release; static tools untouched. Same pinned tooling (Playwright 1.64.1, axe-core 4.14.0, Chromium 156.0.8078.4).

| Check | Result |
|---|---|
| Defect reproduced without any framework | Four fixture pages (`contrast-evaluated`, `contrast-locked-shell`, `contrast-locked-short-body`, `contrast-locked-moving`): with `body { overflow: hidden }` and a 0 px body box axe-core 4.14.0 evaluates no text element for contrast (0 violations, 0 passes, 0 incomplete); with a short static body it skips a centred modal; the control page is fully evaluated. The gate is `overflowHidden` in axe's visibility logic (`overflow === 'hidden'` on any ancestor whose box is under 2 px or does not overlap the element). Whether it is reported upstream was not checked (no web access from the session that found it) |
| Recovery is exact | `overflow: clip !important` on the affected roots recovers the evaluation; geometry of every candidate identical before and during the pass on the two realistic pages; inline `cssText`, computed overflow, scroll positions and geometry verified after the restore (`recovery.restored: true` on every fixture page, asserted by the suite). The synthetic moving page yields `comparable: false`, heuristic findings and `axe-recovery-not-comparable`, and still restores |
| Grades | 7 enabled best-practice-only rules of impact serious/critical in axe 4.14.0 (`accesskeys`, `aria-dialog-name`, `aria-text`, `aria-treeitem-name`, `frame-tested`, `label-title-only`, `tabindex`) were `confirmed` in 1.4.0 and are heuristic/low now; every WCAG-tagged rule of impact critical/serious grades `confirmed` except `target-size` (documented scope); `axe-classification.test.mjs` recomputes both lists from the pinned axe metadata in Node |
| Target size | `targets-bad.html`: 3 violations at mobile and desktop; `targets-good.html`: 0 violations with 4 controls under 24 px (spacing exception, inline link, 24 px button): the exceptions axe implements are honoured, the raw count stays visible |
| Landmarks | `landmarks-good.html` clean; `landmarks-bad.html` + `landmarks-bad-2.html` one `axe-region` (heuristic/low, best-practice, `scope: shell`, two pages) |
| Reflow and text scale | `reflow.html` confirmed at 320 px only (criteria `1.4.10`), `reflow-table.html` heuristic with the exception note; `text-scale.html` `text-clipped-at-scale` at 200% with `textScaleApplied` 1; `text-scale-px.html` `text-scale-not-applied` with `textScaleApplied` 0 |
| Compatibility | default `--viewports` string, `--text-scale` list, checks, finding ids and levels of the legacy fixture pages unchanged (the legacy run gains one real `axe-target-size` lead at mobile on `/`); `390x844` accepted for responsive, screenshots and visual baselines; unknown tokens listed in a note; `--checks axe` alone loads each page once (target size at the initial viewport); JSON additive (compat suite against 1.2.0, 1.3.0 and 1.4.0 shapes: pass); 1.3.0 and 1.4.0 finding baselines: pass; `migrations.json` 1.4.0 documents the re-grades |
| Suites | static 104/104 (103 + the helpers test), browser 10/10 (`FA_REQUIRE_BROWSER=1`: refusals, legacy truth, three 1.4.1 runs, visual lifecycle, axe classification in Node), `plugin-check` pass, `claude plugin validate` pass, `git diff --check` clean |
| Performance (same seven pages, three runs, 1.4.0 scripts from a worktree at `86676ce`) | default configuration 3,024 → 3,202 ms per page (+5.9%, inside the 30% budget); `--checks responsive` 2,787 → 2,793 (+0.2%); `--checks axe` 741 → 761 (+2.7%). A first design ran target size inside the viewport loop even for axe-only runs and cost 744 → 2,465 ms there; it was changed before the commits so that an axe-only run keeps loading each page once |

## Not verified (honest limits)

- **Eval scores**: need `claude plugin eval` with an authenticated account (43 cases × 3 runs × 2 arms by default; the audit case additionally needs `--allow-tools Bash`). Structure validated offline by `plugin-check.mjs`.
- **nginx config**: `nginx -t` not available on this machine; the config is unchanged since the 1.0.0 run that passed it.
- Rendering of TresJS and R3F scenes in a browser (compiled and typed, not rendered); GLSL compiled by TypeScript only as strings.
- Browser behavior of GSAP, Lenis and View Transitions (typed only); the new cleanup tests exercise Three.js disposal and the cleanup helper in Node, not a GPU.
- The semantic engine resolves modules, parses syntax trees and follows barrels with the project's TypeScript; the type checker is opt-in (`--typecheck`), budgeted and limited to TypeScript/JavaScript importers. It was checked against three hand-written ground truths, two real Nuxt codebases and the Next.js reference project, not against `vue-tsc` or a type-level audit of the code. No real Next.js project was available locally. The lexical fallback keeps the 1.1 limits.
- Prose guidance is reviewed, not executable.
