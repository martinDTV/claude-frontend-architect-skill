# Reference index

Every reference of the `frontend-architect` skill with the situation that justifies reading it. The compact task → files table in `SKILL.md` is the first stop; come here when a task does not fit a row there, or to confirm a file before reading it. Read two or three files per task, never the whole set. Framework guidance is written against the versions in `ecosystem-status.md`; the installed version always wins.

## Architecture and structure

| File | Read when |
|---|---|
| `references/architecture.md` | Choosing a stage, patterns (feature-based, vertical slices, DDD, clean/hexagonal), principles, ADRs |
| `references/decision-catalog.md` | Writing the decision statement or an ADR for rendering, monolith/monorepo/microfrontends, composition technique, code organization, BFF, state placement, HTTP client, component library, design system, auth model, i18n, test suite shape or framework migration |
| `references/modular-monolith.md` | Structuring or refactoring an enterprise app (20k–200k lines) into core, shell and modules with public contracts; enforcing boundaries; planning an incremental migration |
| `references/rendering-strategies.md` | Choosing SSR, SSG, ISR/SWR, CSR, streaming or server components per route; hydration cost; enabling SSR on an `ssr: false` app; how caching layers compose |
| `references/folder-structure.md` | Scaffolding or reorganizing; import rules and their enforcement |
| `references/nuxt-layers.md` | Sharing a shell or design system between several Nuxt apps, white-label builds, or deciding layers vs packages vs microfrontends |
| `references/microfrontends.md` | Deciding on and implementing microfrontends or a monorepo; Nuxt + Next.js integration; Module Federation status; criteria to reopen |
| `references/equivalences.md` | Translating concepts between Nuxt/Vue and Next.js/React |
| `references/legacy-modernization.md` | Assessing and modernizing an existing frontend: strangler fig, Options→Composition, Vue 2→3, Nuxt 2/3→4, Pages→App Router, CRA→Vite, JS→TS, legacy widgets, and when not to migrate frameworks |
| `references/auditing.md` | Auditing an existing frontend: read-only rules, evidence tiers, inventory, the script sequence and how to read each output, stage assessment ("1.5"), ranking, comparing the four options, report structure, what an audit must not do |

## Frameworks and language

| File | Read when |
|---|---|
| `references/nuxt.md` | Nuxt 4 conventions, rendering, route rules, runtime config, Nitro, hydration debugging, lazy hydration, large apps, sessions, SSR safety |
| `references/vue-composition-api.md` | Writing components and composables; reactivity limits; auto-import risks; Suspense |
| `references/nextjs.md` | App Router, Server Components, Server Functions, caching, streaming, `proxy.ts`, metadata, client boundary audit |
| `references/react.md` | React components, hooks, composition, effects, forms, rendering optimization, React Compiler |
| `references/typescript.md` | Configuring strict TypeScript, modeling UI state with unions and branded ids, typing composables, hooks and stores, Nuxt and Next.js typing, slow type-checking, TypeScript 7 upgrade questions |

## State, data and errors

| File | Read when |
|---|---|
| `references/state-vue.md` | Classifying state; Pinia, `useState`, VueUse, Pinia ORM |
| `references/pinia-colada.md` | Queries, mutations, keys, invalidation, optimistic updates, SSR |
| `references/state-react.md` | useState/useReducer/Context, Zustand, TanStack Query, Redux Toolkit, Jotai, forms |
| `references/realtime-and-sync.md` | Cache invalidation strategies, optimistic concurrency and 409s, stale-response races, polling vs SSE vs WebSocket, reconnection, cross-tab sync, offline decisions |
| `references/persistence.md` | Persisting state, storage choice, versioning, cross-tab sync, what never to persist |
| `references/api-clients.md` | Choosing the HTTP approach; layering; contracts; errors; cancellation; retries |
| `references/axios.md` | Implementing an Axios layer in Nuxt or Next.js with services, interceptors, auth refresh, tests |
| `references/error-handling.md` | Mapping API errors to UI actions, error boundaries in Nuxt and Next.js, recovery flows (expired session, revoked permission, tenant switch, stale chunks), reporting, the silent-catch policy |

## Screens

| File | Read when |
|---|---|
| `references/forms.md` | Building or reviewing forms: schema-first validation (UForm, vee-validate, React Hook Form, useActionState), server error mapping, wizards, async validation, uploads, form accessibility |
| `references/data-tables.md` | Enterprise lists and tables: server pagination contract, URL state, a `useServerTable` design, TanStack Table or UTable, virtualization, selection and bulk actions, exports, table accessibility |
| `references/charts.md` | Any chart or dashboard: library choice, chart type by question, encoding and color rules, accessibility, performance, realtime, S-curves and Gantt, testing |
| `references/i18n.md` | Locales, routing strategies and SEO, SSR locale detection, ICU messages, Intl formatting and time zones per tenant, RTL, translation workflow |
| `references/component-libraries.md` | Nuxt UI, shadcn/ui and alternatives |
| `references/design-systems.md` | Tokens, theming, multi-brand, component API conventions, governance, UI states |
| `references/accessibility.md` | Accessible components, forms, focus, motion, audits |
| `references/ui-verification.md` | Verifying built screens: the static UI audit and its verification levels, the opt-in browser mode (axe-core, keyboard, dialogs, forms, responsive, hydration, visual regression), what each can and cannot prove, authorization and evidence rules, human-review criteria that no tool replaces |

## Identity, security and operations

| File | Read when |
|---|---|
| `references/auth-session-tenant.md` | Session model (cookie, BFF, tokens), OAuth/OIDC with PKCE, refresh and expiry UX, logout protocol, step-up/MFA, client-side authorization and permission revocation, multi-tenant isolation, PHI/PII handling, migrating tokens out of localStorage |
| `references/security.md` | XSS, CSRF, CSP, clickjacking, cookies, uploads, SSR risks, sanitization, supply chain, review checklist |
| `references/performance.md` | Core Web Vitals, bundles, rendering, images, fonts, reproducible procedures, hydration cost, budgets |
| `references/observability.md` | Field Web Vitals, error reporting with source maps, request-id and trace propagation through SSR, SSR logging, privacy scrubbing and sampling, alerts and frontend SLOs, telemetry tests |
| `references/deployment.md` | Choosing a hosting target, Nitro presets and Next.js output modes, runtime vs build-time config, one build across environments, cache headers and CDN, rollback, previews, flags and canaries, SSR health and containers, CI gate order, multi-tenant and multi-app delivery |
| `references/testing.md` | Test strategy, Vitest, Testing Library, Playwright, lint and architecture tooling, CI |
| `references/testing-scenarios.md` | Adversarial test catalog (contract drift, a11y, visual, responsive, CSP/XSS, concurrency and races, expired session, revoked permission, tenant switch, hydration, SSR leak, failure recovery, leaks), fixtures and factories, anti-flaky rules, minimal matrix by app type |
| `references/ecosystem-status.md` | Verified package versions, deprecations and compatibility notes |

## Assets

| File | Use |
|---|---|
| `assets/adr-template.md` | Recording a decision that is expensive to reverse (one page; a new ADR supersedes, never edits) |
| `assets/audit-report-template.md` | Shape of an audit report: short answer, inventory, dependency map, demonstrated problems, hypothetical risks, options, target, plan, criteria to reopen |
| `assets/frontend-audit.example.json` | Starting point for `.frontend-audit.json`, the folder → domain classification the scripts use |
| `assets/lighthouse-budgets.json` | Starting budgets for Lighthouse CI per route pattern |

## Scripts

Documented in `scripts/README.md`: flags, exit codes, configuration keys, confidence levels and typical false positives of the seven audit scripts.
