---
name: frontend-architect
description: Architecture, structure, code-quality and audit guide for frontends built with Nuxt/Vue or Next.js/React. Use this skill whenever the user creates, structures, refactors, audits or reviews a Nuxt, Vue, Next.js or React project, including choosing a folder layout or module boundaries, rendering strategy (SPA, SSR, SSG, ISR, streaming), deciding where state lives (Pinia, Pinia Colada, useState, Zustand, TanStack Query, Redux), designing the API layer (Axios, fetch, ofetch, useFetch, generated OpenAPI clients, services per domain), TypeScript strictness, forms, data tables, charts, i18n, error handling, realtime and cache sync, authentication, sessions and multi-tenancy, security, accessibility, performance, observability, deployment, testing, legacy modernization, monorepos, Nuxt Layers or microfrontends, and integrating Nuxt with Next.js. Also use it when the user asks whether a frontend "needs" a store, Axios, a monorepo, microfrontends or a framework migration, or asks for an audit of an existing codebase.
license: MIT
---

# Frontend Architect

Guide for building frontends whose architecture is **right-sized**: the simplest design that meets today's real requirements, with seams that keep the next change cheap.

The most common frontend failure is not too little architecture but the wrong amount: a global store for data that belongs to one page, an Axios layer duplicating what the framework already does, a monorepo for one app, microfrontends for one team. Your job is to choose the level that fits, justify it briefly, and apply it consistently.

## Workflow

**Small tasks** (a component, a fix, one endpoint): read the surrounding code, follow its conventions, apply the rules below, run the checks. No architecture essay.

**Structural tasks** (new project, new domain, state or API layer, refactor, audit, big decision):

1. **Inspect before deciding.** Read `package.json` and the lockfile, `nuxt.config.*` or `next.config.*`, `tsconfig.json`, the folder tree, existing state and API code, `CLAUDE.md`/`AGENTS.md`. Get exact installed versions from `node_modules/<pkg>/package.json`; never assume APIs from memory when the installed major differs from what you know.
2. **Measure when the code already exists.** Run the audit scripts (below) on existing codebases before proposing structure; they resolve what reading cannot (Nuxt auto-import coupling, state placement, unguarded routes, leaks, bundle size).
3. **Check current docs** for any API you are unsure about in the installed version. Use the framework's official docs or MCP servers when available (Nuxt UI, Next.js DevTools MCP).
4. **Classify** the project's stage (below) and the state/data needs (`references/state-vue.md` or `references/state-react.md`).
5. **State the decision in two or three lines**: stage, key choices, what you deliberately left out. For decisions that are expensive to reverse, use the format in `references/decision-catalog.md` and write an ADR (`assets/adr-template.md`).
6. **Implement incrementally**, respecting existing conventions. Do not rewrite what was not asked.
7. **Verify** with the project's own scripts: typecheck, lint, tests, build. Report failures honestly; never report numbers you did not measure.

For a broad review of an existing codebase, delegate to the `frontend-reviewer` subagent so the main conversation keeps a clean context, then act on its findings. The audit method itself is in `references/auditing.md`.

Ask a clarifying question only when the answer changes the decision (rendering/SEO needs, team count, deployment model, existing backend contract, tenant model). Otherwise assume, state the assumption, and continue.

## Choosing the stage

Pick the **lowest** stage that satisfies known requirements. Details and signals: `references/architecture.md`. Folder trees: `references/folder-structure.md`. The enterprise default (20k to 200k lines, one or two teams) is a modular monolith: `references/modular-monolith.md`.

| Stage | When | Shape |
|---|---|---|
| **0. Simple app** | Landing, prototype, a few pages, one developer | Framework defaults: pages, components, framework data fetching. No services layer, no store |
| **1. Feature-based app** (default for products) | Real product, several business areas, more than one developer | `features/<domain>/` with its components, composables or hooks, API service, schemas, local stores. Shared UI in `components/ui`. Public `index.ts` per feature |
| **2. Layered features** | Specific features with complex rules, several data sources or offline needs | Same as 1, plus a pure `domain/` and ports for those features only |
| **3. Monorepo** | Two or more deployables that genuinely share code (apps + design system + API contracts) | pnpm workspaces + Turborepo or Nx; each app is stage 1 internally; Nuxt Layers for shared Nuxt slices |
| **4. Microfrontends** | Only with independent teams needing independent deploys on separate business areas, plus the prerequisites in `references/microfrontends.md` | Route-based composition behind a proxy by default; runtime federation only when justified |

Size alone never justifies stage 3 or 4. Several modules in one app, or microservices in the backend, are not reasons for microfrontends. "Stage 1.5" (code grouped by folder but no enforced boundary) is the most common real state of large apps; the fix is contracts and enforcement, not distribution.

## Selecting references

Load only what the task needs: usually two or three files. Never read the whole index.

| Task | Read |
|---|---|
| New project or restructuring | `architecture.md`, `decision-catalog.md`, `folder-structure.md`, `modular-monolith.md` |
| Rendering, caching, hydration cost | `rendering-strategies.md`, then `nuxt.md` or `nextjs.md` |
| Where state lives; cache, sync, realtime | `state-vue.md` or `state-react.md`, `pinia-colada.md`, `realtime-and-sync.md`, `persistence.md` |
| HTTP layer and errors | `api-clients.md`, `axios.md`, `error-handling.md` |
| Nuxt specifics | `nuxt.md`, `vue-composition-api.md`, `nuxt-layers.md` |
| Next.js and React specifics | `nextjs.md`, `react.md` |
| TypeScript strictness and modeling | `typescript.md` |
| Screens: forms, tables, charts, i18n | `forms.md`, `data-tables.md`, `charts.md`, `i18n.md` |
| Auth, sessions, tenants, security | `auth-session-tenant.md`, `security.md` |
| Quality: tests, performance, observability, delivery | `testing.md`, `testing-scenarios.md`, `performance.md`, `observability.md`, `deployment.md` |
| Legacy code and migrations | `legacy-modernization.md` |
| Monorepo, layers, microfrontends, Nuxt + Next integration | `microfrontends.md`, `nuxt-layers.md`, `decision-catalog.md` |
| Audit of an existing codebase | `auditing.md` + the scripts + `frontend-reviewer` |
| UI libraries and design system structure | `component-libraries.md`, `design-systems.md`, `accessibility.md` |
| Visual design, motion, 3D | the `creative-frontend` skill |

## Core decisions (summary; read the reference before applying)

**State** (`state-vue.md`, `state-react.md`, `pinia-colada.md`, `persistence.md`, `realtime-and-sync.md`): classify each piece of state first. Server data belongs in a server-cache tool (Pinia Colada, TanStack Query, or framework fetching for page-level data), never copied into Pinia/Zustand. UI state stays local until two distant components need it. Navigation state lives in the URL. Global stores hold client-owned shared state only. Cache keys include the tenant when there is one.

**API layer** (`api-clients.md`, `axios.md`, `error-handling.md`): in Nuxt, `$fetch`/`useFetch` is the default; in Next.js server code, `fetch` is the default. Choose Axios when there is a concrete reason (shared client across apps, upload/download progress, existing interceptor or generated-client ecosystem, team standard). Whatever the client: one configured instance, services per domain that only call endpoints, composables or hooks that bind services to reactive state, and components that only present. In SSR, create clients per request; never share mutable credentials in a module-level singleton. Normalize errors once and map them to UI states.

**Rendering** (`rendering-strategies.md`, `nuxt.md`, `nextjs.md`): decide SSR, SSG, ISR/SWR or CSR per route from SEO, freshness, personalization and device budget. In Next.js, keep components on the server by default and push `"use client"` to the leaves. In Nuxt, use route rules for hybrid rendering. A client-only app (`ssr: false`) is a legitimate choice; its module-level state becomes a leak the day SSR is enabled.

**Boundaries** (`modular-monolith.md`, `folder-structure.md`, `nuxt-layers.md`): modules by business capability, not by backend service; a public `index.ts` per module; shell and shared code depend only on a core layer; communication through navigation, the core layer, published contracts and the backend, never through a browser event bus or shared domain stores. In Nuxt, module code lives outside auto-imported directories so dependencies stay explicit.

**Identity** (`auth-session-tenant.md`, `security.md`): `HttpOnly` cookie session or BFF; tokens in memory only when a third party forces it; single-flight refresh; logout clears every cache and tab; tenant resolved once and carried in keys; the client adapts UI to permissions, the backend enforces them.

**UI** (`component-libraries.md`, `design-systems.md`, `accessibility.md`, `forms.md`, `data-tables.md`, `charts.md`, `i18n.md`): use the project's library; do not recreate its components. One table component with column configs, not forty hand-written tables. Every data view has loading, empty, error, partial and success states. Accessibility is part of done, not a later pass.

**Quality** (`testing.md`, `testing-scenarios.md`, `performance.md`, `observability.md`, `deployment.md`): measure before optimizing; test behavior, not implementation; adversarial scenarios (expired sessions, races, tenant switch, hydration) have tests; budgets and field data prevent regressions; one build promoted across environments.

For animation, 3D, WebGL, scroll storytelling, visual direction, typography, layout craft or enterprise UI patterns, use the `creative-frontend` skill.

## Non-negotiable rules

- No technology chosen for popularity; every library added must solve a stated problem. No framework migration as a performance or hiring fix.
- No Pinia/Zustand copy of server data that a query cache already owns; no two caches for the same data without an explicit strategy.
- No module-level mutable state or clients with per-user credentials in SSR code (cross-request leaks). In `ssr: false` apps, flag them as the blocker they are before any SSR plan.
- No secrets in client bundles: only `runtimeConfig.public` (Nuxt) or `NEXT_PUBLIC_*` (Next.js) reach the browser, and those are public by definition.
- No authentication tokens in `localStorage` when an `HttpOnly` cookie session is possible. No tenant or user data left in caches, stores or storage after logout or tenant switch.
- No authorization decided in the client: guards, hidden buttons and literal role checks are UX; Server Functions, Route Handlers, Nitro routes and the backend validate input and check permissions per resource.
- No `any` to silence the compiler; validate external data at runtime (Zod or Valibot) where it enters the app; model UI state as discriminated unions, not boolean flags.
- No empty interfaces, pass-through layers, generic repositories or folders created "for consistency".
- No deprecated or unmaintained packages without an explicit warning (check `references/ecosystem-status.md` and re-verify on npm).
- No hydration-unsafe code: no `Date.now()`, `Math.random()` or browser APIs during server render without a client-only guard.
- No resource without a cleanup: listeners, intervals, observers, streams, subscriptions, animation timelines and WebGL objects are released on unmount, logout and tenant switch.
- No custom scroll or animation that breaks keyboard navigation, anchors, focus or `prefers-reduced-motion`.
- No microfrontends, monorepo or Clean Architecture without the criteria in the references being met; no audit claim without `path:line` or a measurement.

## Audit scripts

Read-only, dependency-free Node scripts in `scripts/` (documented in `scripts/README.md`). Run them with `node ${CLAUDE_SKILL_DIR}/scripts/<tool>.mjs <project-root> [--json|--md]`. Findings are labeled **confirmed** (the pattern is present as stated), **heuristic** (lexical signal, verify by reading) or **info**; exit code 1 means confirmed findings, 2 means the tool could not run. An optional `.frontend-audit.json` maps folders to business domains (`assets/frontend-audit.example.json`; `domain-deps.mjs --suggest-config` prints a starter).

| Script | Run when |
|---|---|
| `scripts/domain-deps.mjs` | Deciding boundaries, modules, monorepo or microfrontends; it builds the domain matrix including Nuxt auto-imports and template components, and reports shared→domain, shell→domain, internal imports, hotspots and cycles |
| `scripts/component-complexity.mjs` | Planning a refactor: ranks pages and components by size, state, watchers, HTTP calls, modals and mixed responsibilities |
| `scripts/state-audit.mjs` | Reviewing state: stores shared across domains, server data in stores, raw `useState` keys, tokens in web storage, module-level state that leaks across SSR requests, logout without cache clear |
| `scripts/routes-audit.mjs` | Reviewing guards: Nuxt pages without middleware, literal role checks, Next.js `'use client'` on pages/layouts, Server Actions and Route Handlers without visible authorization or validation |
| `scripts/leak-patterns.mjs` | Reviewing components, composables and hooks for listeners, intervals, observers, streams, GSAP, Lenis, Three.js and subscriptions without cleanup |
| `scripts/contracts-check.mjs` | Enforcing module contracts: missing `index.ts`, internal imports, implicit auto-import coupling, module cycles, breaking changes against a baseline (`--write-baseline` is its only write) |
| `scripts/bundle-budget.mjs` | After a production build: startup JS/CSS and chunk sizes in gzip against budgets; never builds |

Tools report leads; the review confirms them in the code. Report demonstrated, measured and hypothetical findings separately (`references/auditing.md`, `assets/audit-report-template.md`).

## Companion skills

If these are installed, prefer them for deep API detail and keep this skill for decisions and structure: `onmax/nuxt-skills` (Nuxt modules, Nuxt UI), `vuejs-ai/skills` (Vue rules), `vercel-labs/agent-skills` (`react-best-practices`, `composition-patterns`), `anthropics/skills` (`frontend-design`). When they conflict with the installed version's official docs, the docs win. Research notes: the repository's `docs/research.md`.

## References

Read only what the task needs (selection table above).

| File | Read when |
|---|---|
| `references/architecture.md` | Choosing a stage, patterns (feature-based, vertical slices, DDD, clean/hexagonal), principles, ADRs |
| `references/decision-catalog.md` | Writing the decision statement or an ADR for rendering, monolith/monorepo/microfrontends, composition technique, code organization, BFF, state placement, HTTP client, component library, design system, auth model, i18n, test suite shape or framework migration |
| `references/modular-monolith.md` | Structuring or refactoring an enterprise app (20k–200k lines) into core, shell and modules with public contracts; enforcing boundaries; planning an incremental migration |
| `references/rendering-strategies.md` | Choosing SSR, SSG, ISR/SWR, CSR, streaming or server components per route; hydration cost; enabling SSR on an `ssr: false` app; how caching layers compose |
| `references/folder-structure.md` | Scaffolding or reorganizing; import rules and their enforcement |
| `references/nuxt.md` | Nuxt 4 conventions, rendering, route rules, runtime config, Nitro, hydration debugging, lazy hydration, large apps, sessions, SSR safety |
| `references/nuxt-layers.md` | Sharing a shell or design system between several Nuxt apps, white-label builds, or deciding layers vs packages vs microfrontends |
| `references/vue-composition-api.md` | Writing components and composables; reactivity limits; auto-import risks; Suspense |
| `references/nextjs.md` | App Router, Server Components, Server Functions, caching, streaming, `proxy.ts`, metadata, client boundary audit |
| `references/react.md` | React components, hooks, composition, effects, forms, rendering optimization, React Compiler |
| `references/typescript.md` | Configuring strict TypeScript, modeling UI state with unions and branded ids, typing composables, hooks and stores, Nuxt and Next.js typing, slow type-checking, TypeScript 7 upgrade questions |
| `references/state-vue.md` | Classifying state; Pinia, `useState`, VueUse, Pinia ORM |
| `references/pinia-colada.md` | Queries, mutations, keys, invalidation, optimistic updates, SSR |
| `references/state-react.md` | useState/useReducer/Context, Zustand, TanStack Query, Redux Toolkit, Jotai, forms |
| `references/realtime-and-sync.md` | Cache invalidation strategies, optimistic concurrency and 409s, stale-response races, polling vs SSE vs WebSocket, reconnection, cross-tab sync, offline decisions |
| `references/persistence.md` | Persisting state, storage choice, versioning, cross-tab sync, what never to persist |
| `references/api-clients.md` | Choosing the HTTP approach; layering; contracts; errors; cancellation; retries |
| `references/axios.md` | Implementing an Axios layer in Nuxt or Next.js with services, interceptors, auth refresh, tests |
| `references/error-handling.md` | Mapping API errors to UI actions, error boundaries in Nuxt and Next.js, recovery flows (expired session, revoked permission, tenant switch, stale chunks), reporting, the silent-catch policy |
| `references/forms.md` | Building or reviewing forms: schema-first validation (UForm, vee-validate, React Hook Form, useActionState), server error mapping, wizards, async validation, uploads, form accessibility |
| `references/data-tables.md` | Enterprise lists and tables: server pagination contract, URL state, a `useServerTable` design, TanStack Table or UTable, virtualization, selection and bulk actions, exports, table accessibility |
| `references/charts.md` | Any chart or dashboard: library choice, chart type by question, encoding and color rules, accessibility, performance, realtime, S-curves and Gantt, testing |
| `references/i18n.md` | Locales, routing strategies and SEO, SSR locale detection, ICU messages, Intl formatting and time zones per tenant, RTL, translation workflow |
| `references/auth-session-tenant.md` | Session model (cookie, BFF, tokens), OAuth/OIDC with PKCE, refresh and expiry UX, logout protocol, step-up/MFA, client-side authorization and permission revocation, multi-tenant isolation, PHI/PII handling, migrating tokens out of localStorage |
| `references/security.md` | XSS, CSRF, CSP, clickjacking, cookies, uploads, SSR risks, sanitization, supply chain, review checklist |
| `references/accessibility.md` | Accessible components, forms, focus, motion, audits |
| `references/performance.md` | Core Web Vitals, bundles, rendering, images, fonts, reproducible procedures, hydration cost, budgets |
| `references/observability.md` | Field Web Vitals, error reporting with source maps, request-id and trace propagation through SSR, SSR logging, privacy scrubbing and sampling, alerts and frontend SLOs, telemetry tests |
| `references/deployment.md` | Choosing a hosting target, Nitro presets and Next.js output modes, runtime vs build-time config, one build across environments, cache headers and CDN, rollback, previews, flags and canaries, SSR health and containers, CI gate order, multi-tenant and multi-app delivery |
| `references/testing.md` | Test strategy, Vitest, Testing Library, Playwright, lint and architecture tooling, CI |
| `references/testing-scenarios.md` | Adversarial test catalog (contract drift, a11y, visual, responsive, CSP/XSS, concurrency and races, expired session, revoked permission, tenant switch, hydration, SSR leak, failure recovery, leaks), fixtures and factories, anti-flaky rules, minimal matrix by app type |
| `references/legacy-modernization.md` | Assessing and modernizing an existing frontend: strangler fig, Options→Composition, Vue 2→3, Nuxt 2/3→4, Pages→App Router, CRA→Vite, JS→TS, legacy widgets, and when not to migrate frameworks |
| `references/auditing.md` | Auditing an existing frontend: read-only rules, evidence tiers, inventory, the script sequence and how to read each output, stage assessment ("1.5"), ranking, comparing the four options, report structure, what an audit must not do |
| `references/equivalences.md` | Translating concepts between Nuxt/Vue and Next.js/React |
| `references/microfrontends.md` | Deciding on and implementing microfrontends or a monorepo; Nuxt + Next.js integration; Module Federation status; criteria to reopen |
| `references/component-libraries.md` | Nuxt UI, shadcn/ui and alternatives |
| `references/design-systems.md` | Tokens, theming, multi-brand, component API conventions, governance, UI states |
| `references/ecosystem-status.md` | Verified package versions, deprecations and compatibility notes |

Assets: `assets/adr-template.md`, `assets/audit-report-template.md`, `assets/frontend-audit.example.json`, `assets/lighthouse-budgets.json`.
