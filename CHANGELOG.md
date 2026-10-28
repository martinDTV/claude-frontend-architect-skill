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
