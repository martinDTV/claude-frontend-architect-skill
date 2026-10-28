# Validation report

Date: 2026-10-28. Environment: macOS (Darwin 27), Node 22.23, npm 10.9, pnpm 10.15, Python 3.13, Claude Code CLI 2.1.312, nginx not installed.
Commands: `./verification/run-all.sh` plus the checks listed separately below. The previous report (2026-10-17, Ubuntu, 1.0.0) is superseded; its results for unchanged checks were reproduced here.

## Versions under test (installed, not assumed)

nuxt 4.6.x · vue 3.5.44 · pinia 4.1.0 · @pinia/colada 1.4.8 · @pinia/colada-nuxt 1.2.0 · pinia-plugin-persistedstate 4.7.1 · next 16.4.x · react 19.3.x · @tanstack/react-query 5.10x · zustand 5.0.x · axios 1.2x · zod 4.6 · three 0.186.1 · @tresjs/core 5.x · @react-three/fiber 9.8.x · gsap 3.15.0 · lenis 1.3.27 · typescript 5.9 (verification projects) · vitest 5.0.5 · dependency-cruiser 18.x.

## Results

| # | Check | Result |
|---|---|---|
| 1 | `verification/plugin-check.mjs`: manifests in sync (1.1.0), both SKILL.md frontmatters and line budgets (frontend-architect 166 lines, creative-frontend 89), 38 + 11 references linked both ways, cross-references resolvable, 7 scripts documented and executable, 63 `@verify` markers consistent, 43 eval cases well formed | Pass, 0 warnings |
| 2 | Audit scripts: `node --test verification/tools/*.test.mjs` (domain-deps, component-complexity, state-audit, routes-audit, leak-patterns, contracts-check, bundle-budget) against the Nuxt 4 and Next.js 16 fixture apps | 23/23 pass |
| 3 | 79 code blocks extracted from the references into 5 projects (`extract.mjs`; 58 in 1.0.0) | OK |
| 4 | Vue project: `tsc` strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`) | Pass |
| 5 | Vitest (vue): HTTP errors and single-flight refresh, contract validation, cart store, persisted state, plus the new UI-state union, server-error mapping, error → UI mapper, stale-response guards (`latest`, `latestOnly`, `singleFlight`), tenant-scoped state, forbidden handler | 11 files, 22/22 tests pass |
| 6 | React project: `tsc` strict (HTTP provider, TanStack Query hooks, Zustand persist with migration, R3F components) | Pass |
| 7 | Next.js 16.4: `tsc` and `next build` (Server Function with `useActionState` and `updateTag`, HMAC webhook Route Handler, `proxy.ts`) | Pass, 5 static pages |
| 8 | Nuxt 4.6: `nuxt prepare` + `nuxt typecheck` (Axios and `$fetch` plugins, `useApiFetch`, Pinia Colada composables, generic `UiSelect`, `UserList.vue`, TresJS 5 components) | Pass |
| 9 | Creative project: `tsc` strict (GSAP context + matchMedia, Vue composable, `@gsap/react`, Lenis + ScrollTrigger, Three.js scene, ShaderMaterial, cleanup stack) + Vitest (Three.js `disposeObject` disposes every geometry, material and texture; cleanup stack runs once, newest first, isolates errors) | Pass; 2 files, 6/6 tests |
| 10 | SSR runtime: production Nuxt build + mock backend on free ports; 40 concurrent requests from 20 sessions | Documented pattern: **40/40 correct, 0 leaks** |
| 11 | dependency-cruiser rules from `folder-structure.md` on the fixture | Both intentional violations reported |
| 12 | Nginx reverse-proxy example | **Skipped** (nginx not installed on this machine; unchanged since the 1.0.0 run that passed `nginx -t`) |
| 13 | `claude plugin validate` (marketplace and plugin) | Pass (one informational warning: no plugin icon) |
| 14 | `claude plugin eval` (43 scenarios) | **Not run** (requires an authenticated account); structure validated by item 1 |

Wall time of `./verification/run-all.sh` on this machine: 28 s (dependencies pre-installed).

## Audit scripts on real code (read-only)

Two local Nuxt 4 applications were used as smoke targets without modifying them. Numbers are what the tools printed; each tool finished in well under one second.

| Target | Tool | Output |
|---|---|---|
| Back-office app, 287 source files, 80,786 lines under `app/`, flat auto-imported composables, `ssr: false` | `domain-deps` (no config) | 1,534 edges: 628 through auto-imports, 418 through template components, 488 explicit imports; 302 auto-import symbols and 118 components resolved; 101 files unclassified by convention (flat composables), which is exactly what `.frontend-audit.json` is for |
| same | `state-audit` | 1 Pinia store, 17 `useState` keys, 7 web-storage writes; 2 confirmed token-in-web-storage; 26 module-level state candidates reported as low severity because `ssr: false` |
| same | `routes-audit` | 83 pages: 66 guarded, 7 public, 10 without a guard (the app's own audit from the day before had found the same set) |
| same | `leak-patterns` | 21 files with tracked resources; 2 potential leaks |
| same | `bundle-budget` | Startup assets read from `client.precomputed.mjs`: entry JS 148.2 KB gzip, entry CSS 37.4 KB gzip, 1,457.8 KB gzip total JS, largest chunk 264.5 KB gzip (matches the hand-measured 147 KB from the manual audit) |
| Clinic SaaS frontend, 151 files, `app/features/*` layout, Pinia Colada | `domain-deps` (no config) | 471 explicit import edges; features, shell and shared classified by convention; 8 shell→domain findings for `auth`/`organizations` (then suppressed by `coreDomains`) |
| same | `routes-audit` | 16 pages, all protected by two global middlewares |
| same | `state-audit` | 1 confirmed token-in-web-storage downgraded to low because it lives in `auth/adapters/fake.ts` (a test double) |

Defects found and fixed by these runs before shipping: `logout` detection matched any mention of the word (12 false positives in one app); a global `tenant` middleware was taken for an auth guard; `let x = null` at module scope was skipped; Nuxt 4 node-server builds keep the client manifest in `client.precomputed.mjs`, so entry detection by file name reported 0 KB.

## Not verified (honest limits)

- **Eval scores**: need `claude plugin eval` with an authenticated account (43 cases × 3 runs × 2 arms by default; the audit case additionally needs `--allow-tools Bash`). Structure validated offline by `plugin-check.mjs`.
- **nginx config**: `nginx -t` not available on this machine; the config is unchanged since the 1.0.0 run that passed it.
- Rendering of TresJS and R3F scenes in a browser (compiled and typed, not rendered); GLSL compiled by TypeScript only as strings.
- Browser behavior of GSAP, Lenis and View Transitions (typed only); the new cleanup tests exercise Three.js disposal and the cleanup helper in Node, not a GPU.
- The audit scripts are lexical: their heuristics were checked against two real codebases and two fixtures, not against a parser-based oracle.
- Prose guidance is reviewed, not executable.
