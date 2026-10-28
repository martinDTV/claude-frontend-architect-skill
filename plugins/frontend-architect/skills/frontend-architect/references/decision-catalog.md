# Decision catalog

One entry per decision that is expensive to reverse. Each follows the same shape: **Context → Alternatives → Costs → Benefits → Risks → Anti-patterns → Adoption conditions → Review triggers**. Use it to write the two-line decision statement the workflow asks for, and the ADR (`assets/adr-template.md`) when the decision deserves one. Deeper material: `architecture.md`, `rendering-strategies.md`, `modular-monolith.md`, `microfrontends.md`, `nuxt-layers.md`, `state-vue.md`, `state-react.md`, `api-clients.md`, `component-libraries.md`, `design-systems.md`, `legacy-modernization.md`.

## Contents
- D1 Rendering strategy
- D2 Modular monolith, monorepo or microfrontends
- D3 Composition technique: Module Federation, route-based, Nuxt Layers, shared packages
- D4 Code organization: feature-based, vertical slices, DDD, Clean Architecture
- D5 Backend-for-frontend, direct API or API gateway
- D6 Where state lives: global store, remote cache, URL
- D7 HTTP client
- D8 Component library
- D9 Design system package
- D10 Authentication model
- D11 Internationalization approach
- D12 Shape of the test suite
- D13 Framework migration

## D1 Rendering strategy

- **Context**: per route; depends on SEO, freshness, personalization, auth, device budget (`rendering-strategies.md`).
- **Alternatives**: CSR, SSR, SSG, ISR/SWR, hybrid, streaming, server components.
- **Costs**: SSR adds a server, per-request discipline and hydration; SSG adds build time and staleness; CSR adds blank first paint and no SEO.
- **Benefits**: the right choice per route gives fast first paint where it matters and cheap operation where it does not.
- **Risks**: personalized HTML in a shared cache; cross-request leaks on SSR; hydration mismatches.
- **Anti-patterns**: one global `ssr: true/false` without looking at routes; SSR for an authenticated dashboard "because it is faster" without measurement; CSR for a public catalog.
- **Adopt when**: the route table has been written (route → strategy → cache rule → reason).
- **Review triggers**: SEO requirements appear or disappear; p75 LCP over 2.5 s on a route; server cost dominated by SSR of authenticated pages.

## D2 Modular monolith, monorepo or microfrontends

- **Context**: one product, one or several teams, one or several deployables. Microfrontends are not justified by backend microservices: frontend boundaries follow business capabilities and teams, and a screen often aggregates several services.
- **Alternatives**: one app with modules and enforced boundaries (`modular-monolith.md`); a monorepo with several apps and shared packages; microfrontends composed at runtime or by route (`microfrontends.md`).
- **Costs**: monolith: discipline and tooling to keep boundaries; monorepo: workspace tooling, CI graph, versioned internal packages; microfrontends: duplicated runtimes, version drift, cross-app session and navigation, N pipelines, a shell owner.
- **Benefits**: monolith: one build, one deploy, atomic refactors, shared session and theme for free; monorepo: real code sharing between deployables; microfrontends: independent deploys by independent teams.
- **Risks**: choosing distribution to solve a code-organization problem; a monorepo with one app; microfrontends with one team.
- **Anti-patterns**: **microfrontends because the backend has microservices** (frontend boundaries follow business capabilities and teams, not services); "the app is big"; one microfrontend per page.
- **Adopt when**: monolith by default; monorepo when a second deployable genuinely shares code; microfrontends when at least two hard criteria in `microfrontends.md` hold and all prerequisites are met.
- **Review triggers**: a second team with its own release cadence and on-call; a second deployable; measured release coupling (PRs blocked by other areas several times a month).

## D3 Composition technique: Module Federation, route-based composition, Nuxt Layers, shared packages

- **Context**: code or UI must be shared or composed across more than one build or deploy.
- **Alternatives**: build-time packages in a monorepo; Nuxt Layers (`nuxt-layers.md`); route-based composition behind a proxy (each app owns URL prefixes); runtime Module Federation; Web Components for small widgets.
- **Costs**: packages/layers: versioning and rebuilds of consumers; route-based: full page loads between apps, a shared session contract, a proxy to own; Module Federation: singleton management for Vue/Pinia/UI library, manifest deployment order, framework support that is beta for Nuxt 4 and absent for the Next.js App Router.
- **Benefits**: packages/layers: type safety and one runtime; route-based: each app stays a normal framework app with full SSR; federation: one page composed from independently deployed bundles.
- **Risks**: two copies of Vue or Pinia on one page; UI libraries that require a single provider; "nominal compatibility" mistaken for production support.
- **Anti-patterns**: Module Federation to share a header; layers used to split one app into folders; sharing a Pinia/Zustand store across apps.
- **Adopt when**: packages/layers for one deploy; route-based when independent deploys are required; federation only with same framework, mature platform team, verified support for the installed versions and an ADR.
- **Review triggers**: framework support changes (check `ecosystem-status.md`); a widget must be embedded in a third-party site; proxy ownership becomes a bottleneck.

## D4 Code organization: feature-based, vertical slices, DDD, Clean Architecture

- **Context**: how files and dependencies are grouped inside one app.
- **Alternatives**: framework defaults (stage 0); feature folders with public entries (stage 1); vertical slices per use case; domain-driven modules with a pure domain layer; Clean/hexagonal with ports and adapters (stage 2) for specific features.
- **Costs**: more structure means more files and conventions to teach; ports and adapters double the files of CRUD screens.
- **Benefits**: features change together; boundaries make ownership and testing clear; a pure domain layer makes complex rules unit-testable without UI.
- **Risks**: structure applied uniformly to screens that only display server data; "domain" folders that contain DTO mappers and nothing else.
- **Anti-patterns**: generic repositories over HTTP; interfaces with one implementation; a `domain/` folder in a feature with no business rules; `utils/` and `types/` dumping grounds.
- **Adopt when**: feature-based for any product with more than one business area; DDD and Clean only for features that hold real rules (pricing, scheduling, eligibility, offline sync), one feature at a time.
- **Review triggers**: a feature grows rules that need tests without a browser; two data sources for one feature; a second developer cannot find where logic lives.

## D5 Backend-for-frontend, direct API or API gateway

- **Context**: how the browser and the SSR server reach backend services.
- **Alternatives**: direct calls to the API (cookie or token); a BFF owned by the frontend (Nitro `server/api`, Next.js Route Handlers/Server Functions) that aggregates, hides secrets and sets `HttpOnly` cookies; a platform API gateway (auth, rate limits, routing) shared by all clients.
- **Costs**: BFF: another deployable surface to secure, test and monitor; gateway: platform ownership and configuration; direct: the browser sees every service's shape and auth.
- **Benefits**: BFF: per-screen aggregation, secrets off the client, cookie sessions, request shaping; gateway: one entry point for many clients; direct: least moving parts.
- **Risks**: a BFF that becomes a second backend with business logic; a gateway that couples all teams' releases.
- **Anti-patterns**: a BFF proxying every endpoint one-to-one; business rules in the BFF that the mobile app then lacks; Route Handlers called from your own Server Components.
- **Adopt when**: BFF when you need to hide secrets, aggregate several calls for one screen, or set `HttpOnly` cookies from an identity provider; gateway when several clients and services need shared cross-cutting policy; direct otherwise.
- **Review triggers**: a second client (mobile) duplicating BFF logic; latency from chained calls; secrets needed in the browser.

## D6 Where state lives: global store, remote cache, URL

- **Context**: every piece of state classified by kind (`state-vue.md`, `state-react.md`).
- **Alternatives**: local component state; URL query params; a server-cache library (Pinia Colada, TanStack Query, framework fetching); a client store (Pinia, Zustand); Nuxt `useState`; persistence.
- **Costs**: a store adds a global surface that every screen can mutate; a query cache adds a library and key discipline; URL state needs parsing and validation.
- **Benefits**: query cache: deduplication, invalidation, SSR hydration; URL: shareable, back-button friendly; store: shared client-owned state with devtools.
- **Risks**: server data copied into stores (stale, duplicated, never invalidated); filters in a store so links do not restore the view.
- **Anti-patterns**: `useAppStore` holding theme, cart, filters and the user; fetching in a store action and storing arrays; two caches for one dataset.
- **Adopt when**: a store only for client-owned state shared by distant parts of the app; a query cache when data is shared across components or needs invalidation; URL for navigation state; local by default.
- **Review triggers**: the same endpoint called from three places; stale lists after mutations; a store used by three or more domains (`state-audit.mjs` reports it).

## D7 HTTP client

- **Context**: `api-clients.md` and `axios.md`.
- **Alternatives**: framework fetching (`$fetch`/`useFetch`, `fetch` in Next.js server code); ofetch; Axios; generated clients from OpenAPI; GraphQL clients.
- **Costs**: Axios: a dependency, no Next.js request memoization, no direct Nitro calls; generated clients: a build step and a dependency on the backend's spec quality.
- **Benefits**: framework fetching integrates with SSR, caching and payload; Axios gives interceptors, upload progress and a shared instance across non-framework code; generated clients remove handwritten DTO drift.
- **Risks**: a module-level instance with a mutable auth header in SSR (cross-request leak); retry interceptors stacked on query-library retries.
- **Anti-patterns**: `axios.create()` per service file; Axios in Server Components; `as User` casts instead of validation.
- **Adopt when**: framework fetching by default; Axios with a concrete reason (progress events, existing interceptor ecosystem, shared client across apps, team standard); generated clients whenever an OpenAPI spec exists and is maintained.
- **Review triggers**: SSR enabled on an app with a module-level client; a second app needing the same client; upload progress requirements.

## D8 Component library

- **Context**: `component-libraries.md`.
- **Alternatives**: the project's existing library; Nuxt UI (Vue) or shadcn/ui (React); headless primitives (Reka UI, Radix, React Aria) with a custom design system; enterprise suites (PrimeVue, Vuetify, MUI, Mantine); hand-built components.
- **Costs**: a library constrains design freedom and brings its upgrade cadence; headless primitives require building and documenting every component; hand-built means owning accessibility.
- **Benefits**: accessibility, keyboard and focus behavior for free; consistent theming; faster delivery.
- **Risks**: rebuilding modal/table/toast "for control" and owning two focus-trap implementations; CSS-in-JS libraries forcing Client Components in Next.js.
- **Anti-patterns**: mixing two full libraries; deep-selector overrides of library internals; replacing a working library as a side effect of a feature.
- **Adopt when**: new project: Nuxt UI or shadcn/ui unless a brand requires a bespoke system, then headless primitives; existing project: keep the library unless unmaintained or blocking a requirement, and then migrate with an ADR.
- **Review triggers**: the library has no release for a year; accessibility audits fail on library components; a second framework joins the product.

## D9 Design system package

- **Context**: `design-systems.md`; several apps or several teams need the same look.
- **Alternatives**: theme the library in one app; `packages/tokens` + `packages/ui` in a monorepo; tokens only, components per framework; a published design system package with a release process.
- **Costs**: a package needs versioning, docs (Storybook/Histoire), visual tests and an owner; multi-framework means two component implementations.
- **Benefits**: one source of truth for tokens; consistent UI across apps; faster onboarding.
- **Risks**: a design system built before a second consumer exists; components too generic to be useful or too specific to be shared.
- **Anti-patterns**: a `common` package with business components; sharing Vue components with a React app through Web Components to avoid writing them twice.
- **Adopt when**: tokens as soon as there are two apps or two frameworks; a components package when at least two apps in the same framework consume it and someone owns it.
- **Review triggers**: visual drift between apps; a rebrand; a new framework in the product.

## D10 Authentication model

- **Context**: `security.md`, `auth-session-tenant.md`, `persistence.md`.
- **Alternatives**: `HttpOnly` cookie session issued by the backend; a BFF that exchanges OAuth/OIDC codes and holds tokens server-side (token handler pattern); tokens in memory with a refresh cookie; tokens in `localStorage` (not recommended).
- **Costs**: cookie session: CSRF defenses and same-site constraints; BFF: a server component to run and secure; in-memory tokens: refresh choreography and loss on reload.
- **Benefits**: cookies: tokens never readable by JavaScript, SSR sees the session; BFF: identity-provider details stay off the client; in-memory: works with third-party SDKs that demand bearer tokens.
- **Risks**: XSS exfiltrating storage-held tokens; several apps with different session mechanisms on one domain; refresh storms from several interceptors.
- **Anti-patterns**: JWT in `localStorage` for convenience; authorization decided only by hidden buttons and route guards; one refresh timer per tab with no single-flight.
- **Adopt when**: cookie session by default; BFF when the identity provider or a third-party API requires tokens; in-memory tokens only when an SDK forces it, documented in an ADR with XSS hardening (CSP, sanitization).
- **Review triggers**: SSR enabled; a second app sharing login; an identity provider migration; a security review finding.

## D11 Internationalization approach

- **Context**: `i18n.md`.
- **Alternatives**: no i18n (one locale, but `Intl` for dates and numbers); framework module (`@nuxtjs/i18n`, `next-intl`) with routing per locale; a lightweight library without routing; translation management platform integration.
- **Costs**: locale routing affects URLs, SEO and caching; message extraction and review workflows; text expansion in layouts (`layout-and-responsive.md`).
- **Benefits**: correct plurals, dates, numbers and RTL from day one when needed; SEO per locale with `hreflang`.
- **Risks**: adding i18n infrastructure to a single-locale internal tool; hardcoded strings that resist extraction later.
- **Anti-patterns**: string concatenation for sentences; locale stored only in `localStorage` on an SSR app (flash and mismatch); translating the UI without localizing dates and numbers.
- **Adopt when**: a second locale is on the roadmap within the product's life; otherwise use `Intl` and keep strings in one place so extraction is cheap later.
- **Review triggers**: a market with another language; RTL requirement; SEO per country.

## D12 Shape of the test suite

- **Context**: `testing.md`, `testing-scenarios.md`.
- **Alternatives**: mostly unit; mostly component and integration with a few E2E; mostly E2E; contract tests against the backend spec; visual and accessibility automation.
- **Costs**: E2E: slow, flaky without discipline, needs seeded environments; component tests: mocking boundaries correctly; contract tests: coordination with the backend.
- **Benefits**: fast feedback on logic and components; confidence on critical journeys; early detection of API drift.
- **Risks**: a large E2E suite nobody trusts; snapshot tests that pass on broken UI; zero tests on the session core before a refactor.
- **Anti-patterns**: testing implementation details (internal state, mocked framework internals); snapshots of whole pages; E2E for every form field.
- **Adopt when**: logic and services in Vitest; components through Testing Library by role; a short list of E2E journeys on a production build; contract tests when an OpenAPI spec exists; axe on key pages; SSR concurrency test when SSR is on.
- **Review triggers**: a refactor is planned without a net; flaky rate above a few percent; incidents caused by API changes.

## D13 Framework migration

- **Context**: `legacy-modernization.md`; someone proposes moving from Vue to React, Nuxt to Next.js or vice versa, or to a newer framework.
- **Alternatives**: stay and fix the actual problems (performance, structure, tests); upgrade within the framework (Vue 2 → 3, Nuxt 3 → 4, Pages → App Router); strangler-fig migration by route; full rewrite (rarely).
- **Costs**: months of parallel work, feature freeze or double maintenance, loss of domain knowledge encoded in the old code, retraining.
- **Benefits**: only when the current framework cannot meet a hard requirement or is end of life.
- **Risks**: the rewrite reproduces the old architecture problems in a new framework; the business stops seeing features.
- **Anti-patterns**: migrating "for performance" without a profile showing the framework is the cause; "for hiring"; because a sibling team uses the other stack; because an acquisition brought a second stack (route-based composition handles that, see `microfrontends.md`).
- **Adopt when**: the framework is end of life with no supported upgrade path; a hard requirement (platform, rendering model, ecosystem component) is impossible in the current one; and an incremental route-by-route path exists with characterization tests.
- **Review triggers**: framework EOL announcements; a measured, framework-attributable performance ceiling after the fixes in `performance.md`; ecosystem abandonment of a critical dependency.
