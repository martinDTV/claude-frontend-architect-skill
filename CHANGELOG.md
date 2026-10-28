# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-28

### Added
- `frontend-architect` skill: a task → references selection table, and 17 new references: `decision-catalog`, `modular-monolith`, `rendering-strategies`, `nuxt-layers`, `legacy-modernization`, `typescript`, `forms`, `data-tables`, `charts`, `i18n`, `error-handling`, `realtime-and-sync`, `auth-session-tenant`, `observability`, `deployment`, `testing-scenarios`, `auditing`.
- Seven read-only, dependency-free audit scripts shipped in `skills/frontend-architect/scripts/`: `domain-deps` (domain dependency matrix that resolves Nuxt auto-imports and template components), `component-complexity`, `state-audit`, `routes-audit`, `leak-patterns`, `contracts-check`, `bundle-budget`. Findings are tagged confirmed, heuristic or info; JSON and Markdown output; optional `.frontend-audit.json` classification.
- Assets: `audit-report-template.md`, `frontend-audit.example.json`, `lighthouse-budgets.json`.
- `creative-frontend` skill now covers visual design: `visual-design`, `layout-and-responsive`, `enterprise-ui-patterns`, `motion-design`, `animation-lifecycle` references; description extended accordingly.
- `frontend-reviewer` agent runs the audit scripts and reports findings by evidence tier (demonstrated, measured, hypothetical).
- 23 new eval scenarios (21–43), including explicit "say no" cases (Module Federation on Nuxt 4, Redux for a four-page app, Three.js for a tilt effect, framework migration for performance) and a scaffolded audit case that exercises the scripts.
- Verification: `verification/tools/` (node:test suites and two fixture apps for the scripts), `verification/plugin-check.mjs` (manifests, references, cross-references, scripts, evals), Vitest in the creative project for Three.js disposal and cleanup tests, concurrency and tenant tests in the vue project; CI runs all of them.

### Changed
- Stabilization pass (same version, before publication): `frontend-architect` SKILL.md restructured around a task → references selection table, a defaults table and a one-paragraph script list; the full catalog moved to `references/index.md`. Measured with `claude plugin details`: on-invoke cost ~5.1k → ~2.7k tokens, plugin always-on ~623 → ~580 tokens. Both skill descriptions shortened without removing triggers. `plugin-check.mjs` accepts references linked through the index and reports frontmatter and body token estimates.
- Audit scripts: `domain-deps`, `contracts-check` and `state-audit` read the project's generated `.nuxt/types/imports.d.ts` and `.nuxt/components.d.ts` when present, so auto-import and component edges become **verified** (findings through them are `confirmed`) instead of **inferred** (`heuristic`); unknown and package-provided symbols are listed, never turned into edges; stale metadata is reported. The lexical catalog also scans Nuxt 4 `layers/*`. `state-audit` adds `server-data-copied-to-store`. Fixed: absolute `--config` paths, and `--json` output above 64 KiB truncated when piped. Tests 23 → 31.
- Nuxt Layers: the example in `nuxt-layers.md` is now five `@verify` blocks built in the Nuxt verification project; `check-layers.mjs` asserts registration from the generated types and `nuxt typecheck` proves the config typing. Documented that in Nuxt 4 a layer's `app.config.ts` must live in the layer's `app/` directory.
- Security tests: the SSR concurrency test covers tenants and slow responses; `run.sh --negative` proves the test detects the module-level-client leak (39/40); tested helpers for logout protocol, identity epochs and public serialization in `auth-session-tenant.md`; a scenario table in `testing-scenarios.md` states what each pass does and does not prove. Dockerfile sketches in `deployment.md` labeled illustrative.
- Evals: all cases tagged (`activation:`, `domain:`, `say-no`, `suite:`) with `description` and `expected_outcome`; skill-activation indicator graders on every case; four out-of-scope cases (44–47) that must not activate any frontend skill and one explicit both-skills case (48); `verification/evals/run-evals.sh` runs `claude plugin eval` only with a cost ceiling (`smoke`, `activation`, `tag`, `audit`, `full`) and `summarize.mjs` reads the results; classification and results in `docs/evals.md`.
- Extended references: `architecture`, `microfrontends` (Nuxt 4 Module Federation status, criteria to reopen the decision, contracts that a split would break), `ecosystem-status` (snapshot 2026-10-28, new rows), `vue-composition-api` (reactivity limits, auto-import risks), `nuxt` (Nitro, hydration debugging, large apps, sessions, `ssr: false`), `pinia-colada`, `security` (clickjacking, OAuth/OIDC and BFF, uploads, SSR/hybrid risks, sanitization, dependency hygiene), `performance` (reproducible procedures, hydration cost, INP, waterfalls, leaks, budgets), `testing`, `design-systems` (multi-brand tokens, governance), `react` (rendering optimization, hooks pitfalls), `nextjs` (streaming, Server Action checklist, client boundary audit).
- SSR concurrency test picks free ports (or `MOCK_PORT`/`APP_PORT`) instead of hardcoding 8000/3000.
- Manifest descriptions and keywords.

## [1.0.0] - 2026-10-17

### Added
- `frontend-architect` skill: architecture stages, folder structure (Nuxt 4, Next.js 16), Nuxt, Vue Composition API, Next.js App Router, React, state classification and tooling (Pinia 4, Pinia Colada, Pinia ORM, VueUse, Zustand, TanStack Query, Redux Toolkit, Jotai), persistence, API clients, Axios implementation, Nuxt/Next equivalences, microfrontends and monorepos, component libraries, design systems, accessibility, security, performance, testing, ecosystem status.
- `creative-frontend` skill: tool selection, GSAP, motion and scroll (Lenis, CSS scroll-driven animations, View Transitions), Three.js, TresJS 5, React Three Fiber 9, shaders and WebGPU.
- `frontend-reviewer` read-only agent.
- 20 eval scenarios with negative criteria.
- Verification harness: code extraction from references, typecheck/test/build for Vue, React, Next.js, Nuxt and creative examples, SSR concurrency leak test, dependency-cruiser rules test, nginx config test.
- CI workflow, research matrix, ADR template.
