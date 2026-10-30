---
name: frontend-architect
description: Architecture, structure, quality and audit guide for frontends built with Nuxt/Vue or Next.js/React. Use it whenever the user creates, structures, refactors, audits or reviews a Nuxt, Vue, Next.js or React project, including folder layout and module boundaries, rendering strategy (SPA, SSR, SSG, ISR, streaming), where state lives (Pinia, Pinia Colada, useState, Zustand, TanStack Query, Redux), the API layer (fetch, ofetch, Axios, generated clients, services per domain), TypeScript, forms, data tables, charts, i18n, error handling, realtime and caching, authentication, sessions and multi-tenancy, security, accessibility, performance, observability, deployment, testing, legacy modernization, monorepos, Nuxt Layers, microfrontends, and Nuxt with Next.js. Also use it when the user asks whether a frontend "needs" a store, Axios, a monorepo, microfrontends or a framework migration, or asks for an audit of an existing codebase.
license: MIT
---

# Frontend Architect

Build frontends whose architecture is **right-sized**: the simplest design that meets today's real requirements, with seams that keep the next change cheap. The common failure is the wrong amount of architecture, not too little: a global store for one page's data, an Axios layer duplicating the framework, a monorepo for one app, microfrontends for one team. Choose the level that fits, justify it in a few lines, apply it consistently.

## Workflow

**Small tasks** (a component, a fix, one endpoint): read the surrounding code, follow its conventions, apply the rules below, run the checks. No architecture essay.

**Structural tasks** (new project, new domain, state or API layer, refactor, audit, big decision):

1. **Inspect before deciding**: `package.json` and lockfile, `nuxt.config.*` or `next.config.*`, `tsconfig.json`, folder tree, existing state and API code, `CLAUDE.md`/`AGENTS.md`. Exact versions come from `node_modules/<pkg>/package.json`; never assume an API when the installed major differs from what you know.
2. **Measure existing code** with the audit scripts (below) before proposing structure.
3. **Check current docs** for any API you are unsure about (official docs, Nuxt UI or Next.js MCP servers when available).
4. **Classify** the stage (table below) and each piece of state (`references/state-vue.md` or `references/state-react.md`).
5. **State the decision in two or three lines**: stage, key choices, what you left out. Expensive-to-reverse decisions use the format in `references/decision-catalog.md` and an ADR (`assets/adr-template.md`).
6. **Implement incrementally**, respecting existing conventions. Do not rewrite what was not asked.
7. **Verify** with the project's own scripts (typecheck, lint, tests, build) and report real results; never a number you did not measure.

For a broad review of an existing codebase, delegate to the `frontend-reviewer` subagent (method: `references/auditing.md`). Ask a clarifying question only when the answer changes the decision (SEO, team count, deployment model, backend contract, tenant model); otherwise state the assumption and continue.

## Choosing the stage

Pick the **lowest** stage that satisfies known requirements (`references/architecture.md`; trees in `references/folder-structure.md`). The enterprise default from roughly 20k lines is a modular monolith: `references/modular-monolith.md`.

| Stage | When | Shape |
|---|---|---|
| **0. Simple app** | Landing, prototype, a few pages, one developer | Framework defaults; no services layer, no store |
| **1. Feature-based app** (default for products) | Real product, several business areas, more than one developer | `features/<domain>/` owning components, composables/hooks, service, schemas, local stores; public `index.ts`; shared UI in `components/ui` |
| **2. Layered features** | A feature with complex rules, several data sources or offline needs | Stage 1 plus a pure `domain/` and ports for that feature only |
| **3. Monorepo** | Two or more deployables that genuinely share code | pnpm workspaces + Turborepo or Nx; each app stage 1 inside; Nuxt Layers for shared Nuxt slices |
| **4. Microfrontends** | Independent teams, independent deploys, separate business areas, prerequisites in `references/microfrontends.md` | Route-based composition behind a proxy; runtime federation only when justified |

Size, module count or backend microservices never justify stage 3 or 4. "Stage 1.5" (grouped by folder, no enforced boundary) is the usual state of large apps; the fix is contracts and enforcement, not distribution.

## Selecting references

Load two or three files per task. The full catalog with one-line descriptions is `references/index.md`; read it only when the task fits no row below.

| Task | Read |
|---|---|
| New project or restructuring | `architecture.md`, `decision-catalog.md`, `folder-structure.md`, `modular-monolith.md` |
| Rendering, caching, hydration cost | `rendering-strategies.md`, then `nuxt.md` or `nextjs.md` |
| Where state lives; cache, sync, realtime | `state-vue.md` or `state-react.md`, `pinia-colada.md`, `realtime-and-sync.md`, `persistence.md` |
| HTTP layer and errors | `api-clients.md`, `axios.md`, `error-handling.md` |
| Nuxt specifics | `nuxt.md`, `vue-composition-api.md`, `nuxt-layers.md` |
| Next.js and React specifics | `nextjs.md`, `react.md` |
| TypeScript strictness and modeling | `typescript.md` |
| Forms, tables, charts, i18n | `forms.md`, `data-tables.md`, `charts.md`, `i18n.md` |
| Auth, sessions, tenants, security | `auth-session-tenant.md`, `security.md` |
| Tests, performance, observability, delivery | `testing.md`, `testing-scenarios.md`, `performance.md`, `observability.md`, `deployment.md` |
| Legacy code and migrations | `legacy-modernization.md` |
| Monorepo, layers, microfrontends, Nuxt + Next | `microfrontends.md`, `nuxt-layers.md`, `decision-catalog.md` |
| Audit of an existing codebase | `auditing.md`, the scripts, `frontend-reviewer` |
| UI libraries and design system structure | `component-libraries.md`, `design-systems.md`, `accessibility.md` |
| Accessibility, forms, responsive and visual verification of built screens | `ui-verification.md`, `accessibility.md`, `forms.md` |
| Visual design, motion, 3D | the `creative-frontend` skill |

## Defaults

| Concern | Default | Deviate only when |
|---|---|---|
| Server data | Query cache (Pinia Colada, TanStack Query) or framework fetching for page data; keys include the tenant | Never into Pinia/Zustand copies |
| Client state | Local until two distant components need it; navigation state in the URL; stores for client-owned shared state | |
| HTTP | Nuxt `$fetch`/`useFetch`; Next.js server `fetch`; one instance, services per domain, composables/hooks bind, components present; per-request clients in SSR | Axios with a concrete reason (progress events, shared client across apps, existing interceptor ecosystem, team standard) |
| Rendering | Per route from SEO, freshness, personalization and device budget; Server Components by default in Next.js with `'use client'` at the leaves; route rules in Nuxt | `ssr: false` is legitimate for authenticated panels; its module-level state becomes a leak the day SSR is enabled |
| Boundaries | Modules by business capability with a public `index.ts`; shell and shared code depend on a core layer only; communication through navigation, core, published contracts and the backend | Never a browser event bus or shared domain stores; Nuxt module code lives outside auto-imported dirs |
| Identity | `HttpOnly` cookie session or BFF; single-flight refresh; logout clears every cache and tab; tenant resolved once and carried in keys; the client adapts UI, the backend enforces | Tokens in memory only when a third party forces it, recorded in an ADR |
| UI | The project's component library; one table component with column configs; every data view has loading, empty, error, partial and success states; accessibility is part of done | |
| Quality | Measure before optimizing; test behavior; adversarial scenarios have tests; budgets and field data guard regressions; one build promoted across environments | |

## Non-negotiable rules

- No technology chosen for popularity; every library solves a stated problem. No framework migration as a performance or hiring fix.
- No Pinia/Zustand copy of server data a query cache already owns; no two caches for one dataset without a strategy.
- No module-level mutable state or clients with per-user credentials in SSR code; in `ssr: false` apps, name them as the blocker before any SSR plan.
- No secrets in client bundles: only `runtimeConfig.public` or `NEXT_PUBLIC_*` reach the browser, and those are public.
- No tokens in `localStorage` when an `HttpOnly` cookie session is possible; no user or tenant data left in caches, stores or storage after logout or tenant switch.
- No authorization decided in the client: guards, hidden buttons and literal role checks are UX; Server Functions, Route Handlers, Nitro routes and the backend validate and authorize per resource.
- No `any` to silence the compiler; validate external data at runtime (Zod or Valibot); model UI state as discriminated unions.
- No empty interfaces, pass-through layers, generic repositories or folders created "for consistency".
- No deprecated or unmaintained package without a warning (`references/ecosystem-status.md`, re-verified on npm).
- No hydration-unsafe code: `Date.now()`, `Math.random()` or browser APIs during server render only behind a client-only guard.
- No resource without a cleanup: listeners, intervals, observers, streams, subscriptions, animation timelines and WebGL objects are released on unmount, logout and tenant switch.
- No custom scroll or animation that breaks keyboard navigation, anchors, focus or `prefers-reduced-motion`.
- No microfrontends, monorepo or Clean Architecture without the criteria in the references; no audit claim without `path:line` or a measurement.

## Audit scripts

Read-only, dependency-free Node scripts in `scripts/`: `node ${CLAUDE_SKILL_DIR}/scripts/<tool>.mjs <project-root> [--json|--md]`. Run them on existing code before proposing structure: `scripts/domain-deps.mjs` (domain matrix with Nuxt auto-imports and template components verified against `.nuxt` metadata when present, unknown and package-provided symbols, boundary violations, hotspots, cycles), `scripts/component-complexity.mjs` (refactor targets by size, state, HTTP calls, modals), `scripts/state-audit.mjs` (stores shared across domains, server data kept in stores or copied into them from queries, raw `useState` keys, tokens in storage, module-level SSR state, logout cleanup), `scripts/routes-audit.mjs` (unguarded pages, literal roles, `'use client'` too high, Server Actions and handlers without checks), `scripts/leak-patterns.mjs` (resources without cleanup), `scripts/contracts-check.mjs` (module entries, internal imports, implicit coupling, cycles, breaking changes against a baseline), `scripts/bundle-budget.mjs` (gzip sizes of an existing build against budgets; never builds), `scripts/ui-audit.mjs` (accessibility and form-quality patterns provable from Vue templates and JSX: each finding says whether the markup proves it, `static`, needs reading, `review`, or needs a rendered page, `browser`; controls inside a component that declares a label-like prop count as encapsulated and are not reported). `scripts/browser-audit.mjs` is the one opt-in **browser mode** (`references/ui-verification.md`): it runs only when the user provides `--playwright <dir>`, against localhost or hosts the user allows, never production by default, no automatic login, no form submission without `--allow-submit`, evidence only under `--out`; it reports axe-core violations, keyboard reachability, dialogs, responsive defects per viewport and text scale, server HTML versus hydrated DOM, form behaviour and visual regression against approved baselines that it never updates on its own; since 1.4.1 it also reports how many visible text elements axe's contrast rule evaluated on each page (`axe-coverage-gap` when a root `overflow: hidden` hid content, with a verified second pass), grades every axe finding by its WCAG basis (`basis`, `criteria`), runs the WCAG 2.2 target-size rule per viewport and accepts custom viewports, the 320 px `reflow` preset and a 200% text scale. Neither audit is WCAG conformance. Findings are **confirmed** (the pattern is present as stated: an import, a literal key, a measured number, or an auto-import that Nuxt's own `.nuxt` metadata resolves), **heuristic** (lexical signal, including auto-imports inferred without metadata; verify by reading) or **info**; exit 1 means confirmed findings, 2 means the tool could not run. The graph tools parse with the project's own TypeScript and `vue/compiler-sfc` when installed (`--engine auto`, default; the report's `Analysis` line says which engine ran and how each edge was resolved) and fall back to lexical analysis otherwise; `--follow-reexports` names the file that declares a symbol imported through a barrel, and `exclude` plus a `dependencies` policy (allowed pairs, exceptions) live in `.frontend-audit.json`. Run `nuxt prepare` in the project before auditing a Nuxt app so auto-import edges are verified instead of inferred; the tools never run it. Flags, `.frontend-audit.json` keys (`assets/frontend-audit.example.json`) and typical false positives: `scripts/README.md`. The review separates demonstrated, measured and hypothetical findings (`references/auditing.md`, `assets/audit-report-template.md`).

## Companion skills

If installed, prefer them for deep API detail and keep this skill for decisions and structure: `onmax/nuxt-skills`, `vuejs-ai/skills`, `vercel-labs/agent-skills` (`react-best-practices`, `composition-patterns`), `anthropics/skills` (`frontend-design`). When they conflict with the installed version's official docs, the docs win.

Catalog of all references and assets: `references/index.md`.
