# Architecture

## Contents
- Decision principles
- Inputs to evaluate
- Stages and the signals that move a project between them
- Patterns: when to use and when not
- Design principles applied pragmatically
- Modular monolith by default
- DDD and Clean Architecture in the frontend
- Related decisions
- ADRs

## Decision principles

1. **Optimize for change, not imagined scale.** Every frontend changes; few reach the scale people design for.
2. **Framework first.** Nuxt and Next.js already solve routing, data loading, rendering and code splitting. Add a layer only when the framework's mechanism is demonstrably insufficient.
3. **Every layer pays rent.** A layer that only forwards calls is removed. An interface with one implementation and no test double is removed.
4. **Boundaries before distribution.** A feature boundary that is not respected inside one app will not survive being split into separate apps.
5. **Reversible decisions fast, irreversible ones documented.** Folder names are reversible; the framework, rendering strategy, auth model and app boundaries are not.

## Inputs to evaluate

Before recommending structure, establish (from the repo, or by asking only if it changes the outcome):

| Input | Why it matters |
|---|---|
| SEO and first-load needs per route | Rendering mode (SSR/SSG/ISR/CSR), framework fit |
| Size: routes, business domains, expected lifetime | Stage 0 vs 1 |
| Developers and teams, deploy cadence | Stage 3 and 4 criteria |
| Backend contract (REST/GraphQL, OpenAPI available?) | Generated clients vs handwritten services |
| Auth model (cookie session, OAuth/OIDC, tokens) | API layer, SSR safety, storage |
| Offline, real-time or heavy client state | State tooling, layered features |
| Performance budget and target devices | Library choices, hydration strategy |
| Existing conventions | Usually followed, even if not your preference |

## Stages

### Stage 0: simple app
Framework defaults. Data fetched in pages with `useFetch`/`useAsyncData` (Nuxt) or in Server Components (Next.js). Components in `components/`. No service layer, no store, no feature folders.

Move to stage 1 when: a second developer joins, more than one business area appears, the same endpoint is called from several places, or the app is expected to live more than a few months.

### Stage 1: feature-based app (default)
Code grouped by business capability (`features/orders`, `features/catalog`), each owning its components, composables or hooks, API service, schemas and any store it needs. Framework routing files stay thin and compose features. Shared, domain-free UI lives in `components/ui` (or the component library). Cross-feature imports go through the feature's public `index.ts`.

### Stage 2: layered features (per feature)
For a feature with complex business rules, several data sources (REST + websocket + local DB), offline sync, or rules that must be unit-tested without UI:

```
features/checkout/
├── domain/        # pure TypeScript: entities, rules, calculations; no framework imports
├── ports.ts       # interfaces for data sources the domain needs
├── adapters/      # HTTP, storage, websocket implementations of the ports
├── composables/   # (or hooks/) bind domain + adapters to reactive state
└── components/
```

Apply only to features that need it. Other features stay stage 1.

### Stage 3: monorepo
When there are at least two deployables that share real code: several apps, a design system package, generated API contracts, shared config. Tools: pnpm workspaces as the base; Turborepo for task caching and orchestration with low ceremony; Nx when you need project graph constraints, generators and affected-only CI across many projects. A monorepo with one app and "shared" packages used by nobody else is overhead.

### Stage 4: microfrontends
See `microfrontends.md`. Requires independent teams owning separate business areas with independent release needs, plus operational maturity. Default technique: route-based composition behind a reverse proxy, which keeps each app a normal framework app.

## Patterns: when to use and when not

| Pattern | Use when | Do not use when |
|---|---|---|
| Feature-based folders | Any product with more than one business area | A 5-page landing site |
| Vertical slices | Features are mostly independent end to end (UI → API) | Heavy cross-feature workflows; then features plus a small shared domain |
| Domain-driven frontend | The frontend holds real business rules (pricing, eligibility, scheduling) | The frontend only displays and submits backend data |
| Clean / hexagonal (stage 2) | Complex rules, multiple adapters, offline, long-lived product | CRUD screens; it doubles the files for no gain |
| Repository/service per entity | A domain service groups related endpoints | Generic `BaseRepository<T>` wrappers over HTTP |
| Global store | Client-owned state shared across distant parts of the app | Server data (use a query cache) or state used by one subtree |
| Monorepo | Several deployables sharing code | One app |
| Microfrontends | Criteria in `microfrontends.md` met | One team, or "the app is big" |

## Design principles, applied pragmatically

- **Single responsibility**: a component presents; a composable or hook coordinates state and side effects; a service talks to an endpoint; a schema validates. Split when a unit has two reasons to change, not by line count.
- **Dependency inversion**: inject the HTTP instance into services (factory functions) instead of importing a global. This is what makes SSR safe and tests simple. Do not invent interfaces for things with one implementation.
- **Composition over inheritance**: composables, hooks, slots and children props. No base component classes.
- **DRY**: deduplicate knowledge (a business rule, an endpoint contract), not similar-looking code. Two forms that look alike but change for different reasons stay separate.
- **KISS / YAGNI**: no layer, abstraction or library for a requirement nobody has stated.
- **Design by contract**: types at compile time plus runtime validation at the boundaries (API responses, URL params, storage, `postMessage`).
- **High cohesion, low coupling**: a feature's files change together; features talk through public entry points only.

## Modular monolith by default

Between stage 1 and stage 4 there is a long, productive plateau: **one application whose business modules have enforced boundaries** (core → shell → modules, public entries, dependency rules). Most enterprise frontends between 20k and 200k lines belong there and never need to leave. The full pattern, its Nuxt and Next.js specifics, the enforcement tooling and an incremental migration plan are in `modular-monolith.md`. The plugin's audit scripts (`domain-deps.mjs`, `contracts-check.mjs`, `state-audit.mjs`) measure whether a codebase is actually there or only looks like it ("stage 1.5": grouped by folder, no boundary enforced).

Signals that a project is at stage 1.5 rather than 1: no `index.ts` per module, flat auto-imported composables named after domains, a layout or middleware calling domain code, one types file imported by every domain.

## DDD and Clean Architecture in the frontend

Apply domain-driven design vocabulary (bounded contexts, ubiquitous language, aggregates) when the frontend **holds business rules**: pricing and discounts computed client-side, scheduling constraints, eligibility, offline-first editors that must stay consistent without the server. Then a feature earns a pure `domain/` layer (stage 2), ports for its data sources and tests without a browser.

Do not apply it when the frontend **displays and submits** what the backend decides, which is most screens of most products: the "domain" would be DTO mappers, the "use cases" one-line service calls, and every screen would pay for files that never change independently. Bounded contexts still matter at that scale, but as module boundaries (`modular-monolith.md`), not as layers inside each module.

Clean/hexagonal architecture follows the same rule: dependency direction (UI → application → domain, infrastructure behind ports) is valuable where there is a domain to protect; elsewhere it is ceremony. A frontend can have two or three stage-2 features inside an otherwise stage-1 application, and that is the expected shape, not an inconsistency.

## Related decisions

- Per-route rendering, caching and hydration cost: `rendering-strategies.md`.
- Every expensive decision in one format (context, alternatives, costs, benefits, risks, anti-patterns, adoption conditions, review triggers): `decision-catalog.md`.
- Composition across builds and Nuxt-specific sharing: `nuxt-layers.md`, `microfrontends.md`.
- Modernizing what already exists before changing its structure: `legacy-modernization.md`.

## ADRs

Write an ADR (`assets/adr-template.md`, stored in `docs/adr/NNNN-title.md`) when a decision is expensive to reverse or likely to be questioned later: framework choice, rendering strategy, state or server-cache library, HTTP client, auth strategy, component library, animation engine, monorepo or microfrontends, contracts with the backend. Not for trivial or easily reversed choices. One page maximum. An accepted ADR is never edited; a new one supersedes it.
