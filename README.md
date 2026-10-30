# claude-frontend-architect-skill

A Claude Code plugin that makes Claude design, audit and refactor **right-sized** Nuxt/Vue and Next.js/React frontends: it evaluates requirements first, then chooses the folder structure and module boundaries, rendering strategy, state management, API layer, component library, and when (rarely) a monorepo or microfrontends are justified. It covers TypeScript strictness, forms, tables, charts, i18n, authentication and multi-tenancy, security, performance, observability, deployment, testing and legacy modernization, plus visual design, accessible motion and 3D (GSAP, Three.js, TresJS, React Three Fiber). It ships read-only audit scripts that measure what reading cannot: domain coupling through Nuxt auto-imports, state placement, unguarded routes, leaks and bundle budgets.

> 🇲🇽 **Español** más abajo.

Companion to [claude-fastapi-architect-skill](https://github.com/martinDTV/claude-fastapi-architect-skill): same philosophy, applied to the frontend.

## Why

Most frontend skills teach an API. Few teach **when not to use it**. This plugin encodes decisions:

- **Five architecture stages** (simple app → feature-based → layered features → monorepo → microfrontends) with explicit signals and anti-signals, and a modular monolith as the enterprise default.
- **One decision format** (context, alternatives, costs, benefits, risks, anti-patterns, adoption conditions, review triggers) so different references never give incompatible advice on the same problem.
- **State classified before choosing tools**: server data in a query cache (Pinia Colada, TanStack Query), client state in small stores, navigation state in the URL, tenant in every key, never copies of server data in Pinia/Zustand.
- **API layer by layers**: HTTP instance → domain services → query cache → composables/hooks → components. Axios only with a concrete reason; `$fetch` in Nuxt and `fetch` in Next.js server code by default.
- **SSR safety**: per-request clients, no module-level user state, hydration rules; `ssr: false` apps treated as legitimate, with their blockers named.
- **Authorization in the backend**: guards, hidden buttons and literal role checks are UX; Server Functions, Route Handlers and Nitro routes validate and authorize.
- **Microfrontends only with criteria**, route-based composition by default, verified status of Module Federation for Next.js (`@module-federation/nextjs-mf`: Pages Router, Next ≤ 15) and Nuxt 4 (`@module-federation/nuxt`: 0.x beta, Nuxt ≥ 4.5.1).
- **Measured audits**: seven scripts with findings tagged confirmed, heuristic or info; reports separate what is demonstrated, measured and hypothetical.
- **Verified code**: every example marked `@verify` is extracted and compiled, tested or built in CI against current versions; the scripts have their own test suites (see [Validation](#validation)).

## Install

```
/plugin marketplace add martinDTV/claude-frontend-architect-skill
/plugin install frontend-architect@frontend-architect
```

From the terminal: `claude plugin marketplace add martinDTV/claude-frontend-architect-skill` and `claude plugin install frontend-architect@frontend-architect`. Use `--scope project` to install for one project only.

Manual install (skills only, no agent): copy `plugins/frontend-architect/skills/frontend-architect` and `plugins/frontend-architect/skills/creative-frontend` into `~/.claude/skills/` or `.claude/skills/`. The audit scripts travel inside the `frontend-architect` skill folder.

Requirements: Claude Code with plugin support; Node 18+ for the audit scripts (no npm dependencies). The skills are framework guidance; they install nothing into your project.

## What's inside

| Component | Purpose |
|---|---|
| Skill `frontend-architect` | Architecture stages and modular monoliths, decision catalog, folder structure, rendering strategies, Nuxt 4 and Nuxt Layers, Next.js 16, Vue Composition API, React, TypeScript, state (Pinia, Pinia Colada, Zustand, TanStack Query, Redux Toolkit, Jotai), realtime and cache sync, persistence, API clients and Axios, error handling, forms, data tables, charts, i18n, auth, sessions and multi-tenancy, security, accessibility, performance, observability, deployment, testing and adversarial scenarios, legacy modernization, auditing, microfrontends and monorepos, component libraries, design systems |
| Skill `creative-frontend` | Visual design (art direction, typography, color, layout and responsive, enterprise UI patterns), motion design, tool selection for motion and 3D, GSAP, Lenis and scroll, Three.js, TresJS, React Three Fiber, shaders and WebGPU, animation lifecycle with leak tests |
| Agent `frontend-reviewer` | Read-only audit of an existing codebase: runs the scripts, verifies leads in the code, returns prioritized findings by evidence tier |
| Audit scripts (7) | `domain-deps`, `component-complexity`, `state-audit`, `routes-audit`, `leak-patterns`, `contracts-check`, `bundle-budget` (see below) |
| `evals/` | 66 scenarios with positive and negative criteria for `claude plugin eval`, tagged by expected activation and domain, including "say no" cases, out-of-scope cases that must not activate the skills, and a scaffolded audit |

The skills load progressively: `SKILL.md` holds the workflow, a task → references selection table and the defaults (about 2.7k tokens when it fires, measured with `claude plugin details`); `references/index.md` is the full catalog; 49 reference files load only when a task needs them; scripts and assets are read only when used.

## Usage

Skills activate from the task. Examples:

- "Structure a new Nuxt 4 app for a clinic: patients, appointments, billing."
- "Do we need Pinia here, or is useFetch enough?"
- "Our 80k-line Nuxt app has flat auto-imported composables. Should we split it into microfrontends?"
- "Set up Axios with services per domain and Pinia Colada, SSR-safe."
- "Users get redirected to login three times when the session expires mid-page. Fix the design and test it."
- "Design the visual direction for this landing page without making it look generic."
- "Build a GSAP scroll hero that respects reduced motion."
- "Review this frontend and tell me what to fix first." (delegates to `frontend-reviewer`, which runs the scripts)

## Audit scripts

Read-only, dependency-free Node scripts inside the skill (`plugins/frontend-architect/skills/frontend-architect/scripts/`, documented in its `README.md`). Claude runs them when the skill or the agent calls for it; you can run them yourself:

```bash
S=~/.claude/plugins/.../frontend-architect/skills/frontend-architect/scripts   # or the path of a manual install
node $S/domain-deps.mjs . --suggest-config > .frontend-audit.json  # group folders into business domains, then:
node $S/domain-deps.mjs . --md          # domain matrix incl. Nuxt auto-imports and template components
node $S/component-complexity.mjs .      # pages and components with too many responsibilities
node $S/state-audit.mjs .               # stores, useState keys, tokens in storage, module-level SSR state
node $S/routes-audit.mjs .              # guards, Server Actions and handlers without visible authorization
node $S/leak-patterns.mjs .             # listeners, intervals, observers, GSAP, Three.js without cleanup
node $S/contracts-check.mjs .           # module entry points, internal imports, cycles, breaking changes
node $S/bundle-budget.mjs .             # gzip sizes of an existing build against budgets (never builds)
node $S/ui-audit.mjs .                  # a11y and form patterns the markup proves (static), to read (review) or browser-only
node $S/browser-audit.mjs http://localhost:3000 --playwright <dir-with-playwright> --out /tmp/fa-browser   # opt-in browser mode
```

Every script supports `--json`, `--md` (or `--format`), `--fail-on confirmed|any|none` and `--exclude <globs>`. Findings are **confirmed** (the pattern is present as stated), **heuristic** (a signal to verify) or **info**. Since 1.2 the six graph-based tools parse TypeScript, TSX and Vue SFCs with the project's own `typescript` and `vue/compiler-sfc` when installed (`--engine auto`, default) and resolve imports with its `tsconfig`; without them they fall back to the lexical analysis of 1.1 and say so in the report's `Analysis` line. 1.3 adds symbol origins through barrels (`--follow-reexports`, optional `--typecheck` verification), pnpm/npm/yarn workspaces with `package.json` exports, a dependency policy (allowed pairs, exceptions, cycles allowed by design), classified template components, validated exclusions and bundle measurements scoped to the current build. 1.4 adds a static UI audit (accessibility and form patterns with a `verification` field: `static`, `review` or `browser`), SSR rules (`browser-api-in-setup`, `nondeterministic-render`), AST parsing of `definePageMeta` with redirect pages classified, type-checker budgets, and an opt-in **browser mode**: `browser-audit.mjs` drives a Playwright browser you provide against a URL you name (localhost unless allowed, no login, no form submission without `--allow-submit`, evidence only under `--out`, masked screenshots on request) and reports axe-core violations, keyboard and dialog behaviour, responsive defects per viewport and text scale, hydration differences, form behaviour and visual regression against baselines it never updates on its own. 1.4.1 corrects the browser mode: it measures how many visible text elements axe-core's contrast rule actually evaluated on each page (fixed app shells and modal scroll locks make axe skip them silently), recovers the evaluation with a verified, restored second pass, grades every axe finding by its WCAG basis instead of its impact, runs the WCAG 2.2 target-size rule per viewport, reports landmarks as a best practice once per shell, and adds custom viewports, the 320 px reflow preset and a measured 200% text scale. The static tools never execute project code, install packages or prove security; loading the project's own compilers is the one trust boundary, and `--engine lexical` avoids it. Nothing here is WCAG conformance. They tell a reviewer where to look first. Static and browser verification: [`docs/ui-verification.md`](docs/ui-verification.md). Design, trust boundary and limits: [`docs/semantic-engine.md`](docs/semantic-engine.md); measured differences between the two engines: [`docs/benchmarks.md`](docs/benchmarks.md).

## Validation

`verification/` extracts every `@verify` code block from the references into real projects and checks them, tests the scripts against fixture apps, and checks the plugin's own consistency. Results of the last run (2026-10-29, see [`docs/validation-report.md`](docs/validation-report.md)):

| Check | Result |
|---|---|
| `plugin-check.mjs`: manifests in sync, references linked (directly or via `references/index.md`), cross-references, scripts documented and executable, 77 eval cases well formed | Pass |
| Audit scripts: `node --test verification/tools/*.test.mjs` against Nuxt 4, Next.js 16, `tsconfig`-paths, Vue-template, pnpm-workspace, UI and SSR fixtures (five with hand-written ground truths), including `.nuxt` metadata, the semantic engine (precision and recall 100% on the truths), symbol origins, the optional type checker, workspaces, the dependency policy, exclusions, Vue built-ins, Next client/server boundaries, `definePageMeta` with comments and redirect pages, the static UI audit, the SSR rules, execution through symbolic links, byte-identical projects after every static tool, the 1.2.0 and 1.3.0 JSON contracts and the frozen 1.3.0 findings | 99/99 |
| Browser mode: `verification/browser/browser-audit.test.mjs` (refusals without tooling, non-local host, forms without consent, output outside allowed paths; six-page fixture with must-have / must-not-have findings per page; visual baseline lifecycle) with pinned Playwright 1.64.1, axe-core 4.14.0 and Chromium | 3/3 (about 25 s for the fixture run) |
| Scripts on real code: a Nuxt enterprise application (80k lines; 1,512 edges, every one verified by TypeScript or `.nuxt` metadata) and a medical SaaS (Nuxt 4 + Pinia Colada), read-only, both engines compared edge by edge | Findings with file and line in the report; the semantic engine removed three lexical false positives and changed no other finding except template-depth flags (`docs/benchmarks.md`) |
| Vue + Pinia 4 + Pinia Colada + Axios: `tsc --strict` + Vitest (HTTP, refresh, contracts, stores, race guards, tenant scope, logout protocol, identity epochs, public serialization) | 31/31 |
| React + TanStack Query + Zustand + React Three Fiber: `tsc --strict` | Pass |
| Next.js 16.4: `tsc` + `next build` | Pass |
| Nuxt 4.6: `nuxt prepare` + `check-layers.mjs` (the `layers/base` example registers its component, composable and typed config) + `nuxt typecheck` | Pass, 7/7 |
| Nuxt SSR runtime, 40 concurrent requests from 20 sessions over 3 tenants with slow responses | Documented pattern: 0 leaks; negative control leaks 39/40 (the test is not vacuous) |
| Creative: `tsc --strict` + Vitest (Three.js disposal, cleanup stack) | Pass (see report) |
| dependency-cruiser boundary rules; Nginx reverse-proxy example | Pass; `nginx -t` not run on this machine (no nginx) |
| `claude plugin validate` (marketplace and plugin) | Pass |
| `claude plugin eval` (77 scenarios) | Smoke subset of the 1.1 cases run under a cost ceiling (see `docs/evals.md` for scores and limits); cases 49–77 not yet run; the full suite is not run in CI |

Run it yourself: `./verification/run-all.sh` (Node 22, pnpm 10, python3; nginx optional). Run the evals with your account through `./verification/evals/run-evals.sh smoke|activation|tag <tag>|full`, which always sets a cost ceiling (details and results in [`docs/evals.md`](docs/evals.md); the audit case needs `--allow-tools Bash`).

## Updating

After installing: `claude plugin update frontend-architect@frontend-architect`. Maintainers: bump `version` in both `plugin.json` and `marketplace.json`, update `CHANGELOG.md`, re-run `verification/run-all.sh` and the research snapshot in `references/ecosystem-status.md`.

Which version a session runs: Claude Code keeps one installed copy **per scope** (`user`, `project`, `local`) in `~/.claude/plugins/installed_plugins.json`, each pointing at its own cache directory (`~/.claude/plugins/cache/frontend-architect/frontend-architect/<version>/`), and a skill reports the directory it was loaded from. `claude plugin update … --scope user` updates the user copy only; a project or local copy installed earlier inside a repository keeps winning in that repository until it is updated or uninstalled from inside that repository with the same `--scope` (which may write that repository's `.claude/settings*.json`, so do it deliberately). A running session keeps the copy it started with until `/reload-plugins` or a restart. To check: `claude plugin list` (or read the JSON) and compare the `installPath` version with the base directory the skill prints.

## Troubleshooting

- **Skill does not activate**: mention the framework explicitly ("in this Nuxt app…"), or check `/plugin` shows the plugin enabled.
- **Advice does not match your version**: the skill checks `node_modules` versions; if you are on Nuxt 3 or Next 15, say so. Version-specific notes are in each reference.
- **A script reports many "unclassified" files**: flat Nuxt composables cannot be mapped to domains by convention; run `domain-deps.mjs --suggest-config` and group the folders in `.frontend-audit.json`.
- **`bundle-budget` exits 2**: it needs an existing production build; it never builds. For Nuxt 4 node-server builds it reads `client.precomputed.mjs`; otherwise pass `--html` with a saved rendered page.
- **Corporate Claude Code blocks marketplaces**: use the manual install.
- **`npm install` fails on Nuxt 4.6 + Pinia 4 with `reading 'edgesOut'`**: an npm 10 resolver bug; use pnpm.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Research notes and complementary skills: [docs/research.md](docs/research.md). Internal design: [docs/architecture.md](docs/architecture.md).

## License

[MIT](LICENSE). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## 🇲🇽 Español

Plugin para Claude Code que hace que Claude diseñe, audite y refactorice frontends en Nuxt/Vue y Next.js/React **a la medida del proyecto**. Primero evalúa requisitos y después decide estructura de carpetas y límites entre módulos, estrategia de renderizado, manejo de status, capa de APIs, librería de componentes y, solo si se justifica, monorepo o microfrontends. Cubre TypeScript estricto, formularios, tablas, gráficas, i18n, autenticación y multi-tenancy, seguridad, rendimiento, observabilidad, despliegue, pruebas y modernización de código heredado, además de diseño visual, animación accesible y 3D (GSAP, Three.js, TresJS, React Three Fiber).

**Instalación:**

```
/plugin marketplace add martinDTV/claude-frontend-architect-skill
/plugin install frontend-architect@frontend-architect
```

**Qué la hace diferente:** clasifica el status antes de elegir herramientas, usa Axios solo con una razón concreta y crea un cliente HTTP por request en SSR. Los microfrontends son el último recurso (y los microservicios del backend no son un motivo). Incluye siete scripts de auditoría de solo lectura que miden lo que la lectura no ve: el acoplamiento entre dominios a través de los auto-imports de Nuxt, la ubicación del status, rutas sin guard, fugas de recursos y presupuestos de bundle; cada hallazgo se etiqueta como confirmado, heurístico o informativo. Todo el código de ejemplo está compilado y probado en CI. En una prueba real con 40 requests concurrentes, el patrón documentado tuvo 0 fugas de datos entre usuarios, mientras que el antipatrón común filtró datos en 38 de 40 respuestas.
