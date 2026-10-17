---
name: frontend-architect
description: Architecture, structure and code-quality guide for frontends built with Nuxt/Vue or Next.js/React. Use this skill whenever the user creates, structures, refactors or reviews a Nuxt, Vue, Next.js or React project, including choosing a folder layout, deciding where state lives (Pinia, Pinia Colada, useState, Zustand, TanStack Query, Redux), designing the API layer (Axios, fetch, ofetch, useFetch, generated OpenAPI clients, services per domain), choosing a component library (Nuxt UI, shadcn/ui), design systems, SSR and hydration, authentication, security, accessibility, performance, testing, monorepos or microfrontends, and integrating Nuxt with Next.js. Also use it when the user asks whether a frontend "needs" a store, Axios, a monorepo or microfrontends.
license: MIT
---

# Frontend Architect

Guide for building frontends whose architecture is **right-sized**: the simplest design that meets today's real requirements, with seams that keep the next change cheap.

The most common frontend failure is not too little architecture but the wrong amount: a global store for data that belongs to one page, an Axios layer duplicating what the framework already does, a monorepo for one app, microfrontends for one team. Your job is to choose the level that fits, justify it briefly, and apply it consistently.

## Workflow

**Small tasks** (a component, a fix, one endpoint): read the surrounding code, follow its conventions, apply the rules below, run the checks. No architecture essay.

**Structural tasks** (new project, new domain, state or API layer, refactor, audit):

1. **Inspect before deciding.** Read `package.json` and the lockfile, `nuxt.config.*` or `next.config.*`, `tsconfig.json`, the folder tree, existing state and API code, `CLAUDE.md`/`AGENTS.md`. Get exact installed versions from `node_modules/<pkg>/package.json`; never assume APIs from memory when the installed major differs from what you know.
2. **Check current docs** for any API you are unsure about in the installed version. Use the framework's official docs or MCP servers when available (Nuxt UI, Next.js DevTools MCP).
3. **Classify** the project's stage (below) and the state/data needs (`references/state-vue.md` or `references/state-react.md`).
4. **State the decision in two or three lines**: stage, key choices, what you deliberately left out. Write an ADR (`assets/adr-template.md`) only for decisions that are expensive to reverse.
5. **Implement incrementally**, respecting existing conventions. Do not rewrite what was not asked.
6. **Verify** with the project's own scripts: typecheck, lint, tests, build. Report failures honestly.

For a broad review of an existing codebase, delegate to the `frontend-reviewer` subagent so the main conversation keeps a clean context, then act on its findings.

Ask a clarifying question only when the answer changes the decision (rendering/SEO needs, team count, deployment model, existing backend contract). Otherwise assume, state the assumption, and continue.

## Choosing the stage

Pick the **lowest** stage that satisfies known requirements. Details and signals: `references/architecture.md`. Folder trees: `references/folder-structure.md`.

| Stage | When | Shape |
|---|---|---|
| **0. Simple app** | Landing, prototype, a few pages, one developer | Framework defaults: pages, components, framework data fetching. No services layer, no store |
| **1. Feature-based app** (default for products) | Real product, several business areas, more than one developer | `features/<domain>/` with its components, composables or hooks, API service, schemas, local stores. Shared UI in `components/ui` |
| **2. Layered features** | Specific features with complex rules, several data sources or offline needs | Same as 1, plus a pure `domain/` and ports for those features only |
| **3. Monorepo** | Two or more deployables that genuinely share code (apps + design system + API contracts) | pnpm workspaces + Turborepo or Nx; each app is stage 1 internally |
| **4. Microfrontends** | Only with independent teams needing independent deploys on separate business areas, plus the prerequisites in `references/microfrontends.md` | Route-based composition behind a proxy by default; runtime federation only when justified |

Size alone never justifies stage 3 or 4. Several modules in one app are not a reason for microfrontends.

## Core decisions (summary; read the reference before applying)

**State** (`state-vue.md`, `state-react.md`, `pinia-colada.md`, `persistence.md`): classify each piece of state first. Server data belongs in a server-cache tool (Pinia Colada, TanStack Query, or framework fetching for page-level data), never copied into Pinia/Zustand. UI state stays local until two distant components need it. Global stores hold client-owned shared state only.

**API layer** (`api-clients.md`, `axios.md`): in Nuxt, `$fetch`/`useFetch` is the default; in Next.js server code, `fetch` is the default. Choose Axios when there is a concrete reason (shared client across apps, upload/download progress, existing interceptor or generated-client ecosystem, team standard). Whatever the client: one configured instance, services per domain that only call endpoints, composables or hooks that bind services to reactive state, and components that only present. In SSR, create clients per request; never share mutable credentials in a module-level singleton.

**Rendering** (`nuxt.md`, `nextjs.md`): decide SSR, SSG, ISR or CSR per route from SEO and freshness needs. In Next.js, keep components on the server by default and push `"use client"` to the leaves. In Nuxt, use route rules for hybrid rendering.

**UI** (`component-libraries.md`, `design-systems.md`, `accessibility.md`): use the project's library; do not recreate its components. Every data view has loading, empty, error and success states. Accessibility is part of done, not a later pass.

**Quality** (`security.md`, `performance.md`, `testing.md`): measure before optimizing; test behavior, not implementation; never trust the client for authorization.

For animation, 3D, WebGL or scroll storytelling, use the `creative-frontend` skill.

## Non-negotiable rules

- No technology chosen for popularity; every library added must solve a stated problem.
- No Pinia/Zustand copy of server data that a query cache already owns; no two caches for the same data without an explicit strategy.
- No module-level mutable state or clients with per-user credentials in SSR code (cross-request leaks).
- No secrets in client bundles: only `runtimeConfig.public` (Nuxt) or `NEXT_PUBLIC_*` (Next.js) reach the browser, and those are public by definition.
- No authentication tokens in `localStorage` when an `HttpOnly` cookie session is possible.
- No `any` to silence the compiler; validate external data at runtime (Zod or Valibot) where it enters the app.
- No empty interfaces, pass-through layers, generic repositories or folders created "for consistency".
- No deprecated or unmaintained packages without an explicit warning (check `references/ecosystem-status.md` and re-verify on npm).
- No hydration-unsafe code: no `Date.now()`, `Math.random()` or browser APIs during server render without a client-only guard.
- No custom scroll or animation that breaks keyboard navigation, anchors, focus or `prefers-reduced-motion`.
- No microfrontends, monorepo or Clean Architecture without the criteria in the references being met.

## Companion skills

If these are installed, prefer them for deep API detail and keep this skill for decisions and structure: `onmax/nuxt-skills` (Nuxt modules, Nuxt UI), `vuejs-ai/skills` (Vue rules), `vercel-labs/agent-skills` (`react-best-practices`, `composition-patterns`), `anthropics/skills` (`frontend-design`). When they conflict with the installed version's official docs, the docs win. Research notes: the repository's `docs/research.md`.

## References

Read only what the task needs.

| File | Read when |
|---|---|
| `references/architecture.md` | Choosing a stage, patterns (feature-based, vertical slices, DDD, clean/hexagonal), principles, ADRs |
| `references/folder-structure.md` | Scaffolding or reorganizing; import rules and their enforcement |
| `references/nuxt.md` | Nuxt 4 conventions, rendering, route rules, runtime config, server routes, layers, SSR safety |
| `references/vue-composition-api.md` | Writing components and composables with `<script setup lang="ts">` |
| `references/nextjs.md` | App Router, Server Components, Server Functions, caching, `proxy.ts`, metadata |
| `references/react.md` | React components, hooks, composition, effects, forms, React Compiler |
| `references/state-vue.md` | Classifying state; Pinia, `useState`, VueUse, Pinia ORM |
| `references/pinia-colada.md` | Queries, mutations, keys, invalidation, optimistic updates, SSR |
| `references/state-react.md` | useState/useReducer/Context, Zustand, TanStack Query, Redux Toolkit, Jotai, forms |
| `references/persistence.md` | Persisting state, storage choice, versioning, cross-tab sync, what never to persist |
| `references/api-clients.md` | Choosing the HTTP approach; layering; contracts; errors; cancellation; retries |
| `references/axios.md` | Implementing an Axios layer in Nuxt or Next.js with services, interceptors, auth refresh, tests |
| `references/equivalences.md` | Translating concepts between Nuxt/Vue and Next.js/React |
| `references/microfrontends.md` | Deciding on and implementing microfrontends or a monorepo; Nuxt + Next.js integration |
| `references/component-libraries.md` | Nuxt UI, shadcn/ui and alternatives |
| `references/design-systems.md` | Tokens, theming, UI states, UX writing, avoiding generic AI design |
| `references/accessibility.md` | Accessible components, forms, focus, motion, audits |
| `references/security.md` | XSS, CSRF, CSP, cookies, sessions, SSR risks, supply chain |
| `references/performance.md` | Core Web Vitals, bundles, rendering, images, fonts, measuring |
| `references/testing.md` | Test strategy, Vitest, Testing Library, Playwright, lint and architecture tooling, CI |
| `references/ecosystem-status.md` | Verified package versions, deprecations and compatibility notes |

Assets: `assets/adr-template.md`.
