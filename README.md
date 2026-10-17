# claude-frontend-architect-skill

A Claude Code plugin that makes Claude design **right-sized** Nuxt/Vue and Next.js/React frontends: it evaluates requirements first, then chooses the folder structure, state management, API layer, component library, rendering strategy, and when (rarely) a monorepo or microfrontends are justified. It also covers accessible, performant motion and 3D (GSAP, Three.js, TresJS, React Three Fiber).

> 🇲🇽 **Español** más abajo.

Companion to [claude-fastapi-architect-skill](https://github.com/martinDTV/claude-fastapi-architect-skill): same philosophy, applied to the frontend.

## Why

Most frontend skills teach an API. Few teach **when not to use it**. This plugin encodes decisions:

- **Five architecture stages** (simple app → feature-based → layered features → monorepo → microfrontends) with explicit signals and anti-signals.
- **State classified before choosing tools**: server data in a query cache (Pinia Colada, TanStack Query), client state in small stores, navigation state in the URL, never copies of server data in Pinia/Zustand.
- **API layer by layers**: HTTP instance → domain services → query cache → composables/hooks → components. Axios only with a concrete reason; `$fetch` in Nuxt and `fetch` in Next.js server code by default.
- **SSR safety**: per-request clients, no module-level user state, hydration rules.
- **Microfrontends only with criteria**, route-based composition by default, and a verified warning that `@module-federation/nextjs-mf` does not support the App Router or Next 16.
- **Verified code**: every example marked `@verify` is extracted and compiled, tested or built in CI against current versions (see [Validation](#validation)).

## Install

```
/plugin marketplace add martinDTV/claude-frontend-architect-skill
/plugin install frontend-architect@frontend-architect
```

From the terminal: `claude plugin marketplace add martinDTV/claude-frontend-architect-skill` and `claude plugin install frontend-architect@frontend-architect`. Use `--scope project` to install for one project only.

Manual install (skills only, no agent): copy `plugins/frontend-architect/skills/frontend-architect` and `plugins/frontend-architect/skills/creative-frontend` into `~/.claude/skills/` or `.claude/skills/`.

Requirements: Claude Code with plugin support. The skills are framework guidance; they install nothing into your project.

## What's inside

| Component | Purpose |
|---|---|
| Skill `frontend-architect` | Architecture stages, folder structure, Nuxt 4, Next.js 16, Vue Composition API, React, state (Pinia, Pinia Colada, Zustand, TanStack Query, Redux Toolkit, Jotai), persistence, API clients and Axios, microfrontends and monorepos, component libraries, design systems, accessibility, security, performance, testing |
| Skill `creative-frontend` | Tool selection for motion and 3D, GSAP, Lenis and scroll, Three.js, TresJS, React Three Fiber, shaders and WebGPU, with reduced-motion and cleanup rules |
| Agent `frontend-reviewer` | Read-only audit of an existing codebase with prioritized findings |
| `evals/` | 20 scenarios with positive and negative criteria for `claude plugin eval` |

The skills load progressively: `SKILL.md` holds the decision workflow; 27 reference files load only when a task needs them.

## Usage

Skills activate from the task. Examples:

- "Structure a new Nuxt 4 app for a clinic: patients, appointments, billing."
- "Do we need Pinia here, or is useFetch enough?"
- "Set up Axios with services per domain and Pinia Colada, SSR-safe."
- "Our Next.js app is big. Should we use microfrontends?"
- "Integrate our Nuxt storefront and Next.js dashboard under one domain."
- "Build a GSAP scroll hero that respects reduced motion."
- "Review this frontend and tell me what to fix first." (delegates to `frontend-reviewer`)

## Validation

`verification/` extracts every `@verify` code block from the references into real projects and checks them. Results of the last run (2026-10-17):

| Check | Result |
|---|---|
| Vue + Pinia 4 + Pinia Colada + Axios: `tsc --strict` + Vitest (HTTP errors, single-flight 401 refresh, contract validation, stores, persistence) | Pass, 6/6 tests |
| React + TanStack Query + Zustand + React Three Fiber: `tsc --strict` | Pass |
| Next.js 16.4: `tsc` + `next build` (Server Functions, `proxy.ts`, Route Handler) | Pass |
| Nuxt 4.6: `nuxt typecheck` (plugins, composables, generic SFC, TresJS 5) | Pass; negative test confirms errors are detected |
| Nuxt SSR runtime, 40 concurrent requests from 20 sessions | Documented pattern: 0 leaks. Module-level client anti-pattern: 38/40 responses leaked another user's data |
| GSAP, Lenis, Three.js, shaders: `tsc --strict` | Pass |
| dependency-cruiser boundary rules | Detects both intentional violations, allows public imports |
| Nginx reverse-proxy example | `nginx -t` passes |
| `claude plugin validate` (marketplace and plugin) | Pass |
| `claude plugin eval` (20 scenarios) | **Not run here** (requires an authenticated Claude account); suite structure accepted by the CLI |

Full report: [`docs/validation-report.md`](docs/validation-report.md). Run it yourself: `./verification/run-all.sh` (Node 22, pnpm 10, python3; nginx optional).

Run the evals with your account: `claude plugin eval ./plugins/frontend-architect` (each run consumes tokens).

## Updating

After installing: `claude plugin update frontend-architect@frontend-architect`. Maintainers: bump `version` in both `plugin.json` and `marketplace.json`, update `CHANGELOG.md`, re-run `verification/run-all.sh` and the research snapshot in `references/ecosystem-status.md`.

## Troubleshooting

- **Skill does not activate**: mention the framework explicitly ("in this Nuxt app…"), or check `/plugin` shows the plugin enabled.
- **Advice does not match your version**: the skill checks `node_modules` versions; if you are on Nuxt 3 or Next 15, say so. Version-specific notes are in each reference.
- **Corporate Claude Code blocks marketplaces**: use the manual install.
- **`npm install` fails on Nuxt 4.6 + Pinia 4 with `reading 'edgesOut'`**: an npm 10 resolver bug; use pnpm.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Research notes and complementary skills: [docs/research.md](docs/research.md). Internal design: [docs/architecture.md](docs/architecture.md).

## License

[MIT](LICENSE). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## 🇲🇽 Español

Plugin para Claude Code que hace que Claude diseñe frontends en Nuxt/Vue y Next.js/React **a la medida del proyecto**. Primero evalúa requisitos y después decide estructura de carpetas, manejo de estado, capa de APIs, librería de componentes, renderizado y, solo si se justifica, monorepo o microfrontends. Incluye además animación y 3D accesibles y eficientes: GSAP, Three.js, TresJS y React Three Fiber.

**Instalación:**

```
/plugin marketplace add martinDTV/claude-frontend-architect-skill
/plugin install frontend-architect@frontend-architect
```

**Qué la hace diferente:** clasifica el estado antes de elegir herramientas, usa Axios solo con una razón concreta y crea un cliente HTTP por request en SSR. Los microfrontends son el último recurso, y todo el código de ejemplo está compilado y probado en CI. En una prueba real con 40 requests concurrentes, el patrón documentado tuvo 0 fugas de datos entre usuarios, mientras que el antipatrón común filtró datos en 38 de 40 respuestas.
