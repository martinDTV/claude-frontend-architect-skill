# Microfrontends and monorepos

## Contents
- Default: do not split
- Readiness assessment
- Techniques compared
- Recommended: route-based composition behind a reverse proxy
- Integrating Nuxt and Next.js
- Module Federation status (verified)
- Nuxt 4 status (verified 2026-10-28)
- Measurable criteria to reopen the decision
- Contracts that a split would break
- Monorepo tooling
- Anti-patterns

## Default: do not split

The default is **one modular app** (stage 1 in `architecture.md`). Microfrontends trade build-time simplicity for runtime and organizational complexity: duplicated framework code, version drift, harder debugging, cross-app auth and navigation, and N deployment pipelines. They solve an organizational problem (independent teams shipping independently), not a code-size problem.

## Readiness assessment

Microfrontends are justified only when **at least two** hard criteria hold **and** all prerequisites are met.

Hard criteria:
- [ ] Separate teams own separate business areas end to end, including on-call.
- [ ] Those teams are blocked by shared release cycles in practice, not hypothetically.
- [ ] Areas need different technology or rendering (for example a Nuxt storefront and a Next.js dashboard after an acquisition), or a legacy app must be strangled gradually.
- [ ] Different scaling, compliance or isolation needs per area.

Prerequisites:
- [ ] Boundaries already clean inside the current app (features import each other only through public APIs).
- [ ] Shared design tokens and a contracts package exist or are planned.
- [ ] A single session model works across apps (same-site cookie).
- [ ] CI/CD can deploy each app independently; centralized logging, tracing and RUM per app.
- [ ] Someone owns the shell, routing and cross-app concerns.

If the result is "not ready", report what fails and recommend the cheaper step: enforce feature boundaries (`folder-structure.md`) and, if several deployables share code, a monorepo.

## Techniques compared

| Technique | Composition | Independent deploy | Mixes frameworks | SSR/SEO | Complexity | Use when |
|---|---|---|---|---|---|---|
| **Route-based (reverse proxy / multi-zones)** | Per URL path, full page navigation between apps | Yes | Yes | Full, each app SSRs itself | Low | **Default.** Areas map to URL sections |
| Build-time packages (monorepo) | npm packages at build time | No (rebuild consumers) | No | Full | Low | Shared code, one team or coordinated releases |
| Module Federation (runtime) | JS modules loaded at runtime in one page | Yes | Possible but hard | Hard; framework-specific | High | Same framework, same page, mature platform team |
| single-spa | Client-side orchestration of several apps on one page | Yes | Yes | Weak | High | Client-only portals mixing frameworks |
| Web Components | Custom elements on a page | Yes | Yes | Limited (Declarative Shadow DOM) | Medium | Small shared widgets (header, chat) across stacks |
| Server-side / edge composition (ESI, fragments) | HTML fragments assembled by server or edge | Yes | Yes | Full | Medium-high | Content-heavy pages assembled from several teams |
| Iframes | Isolated documents | Yes | Yes | Poor | Low technically, poor UX | Third-party or untrusted content, legacy isolation |

Vue and React components cannot be used inside each other natively. Mixing them on one page requires Web Components or a runtime orchestrator, with two framework runtimes loaded.

## Route-based composition

One domain, a reverse proxy (Nginx, Traefik, Kubernetes Ingress, cloud load balancer or edge router) maps path prefixes to apps. Each app is a normal framework app with a base path.

```nginx
# @verify nginx:/etc/nginx/conf.d/frontends.conf
upstream storefront_nuxt { server 127.0.0.1:3000; }
upstream dashboard_next  { server 127.0.0.1:3001; }

server {
    listen 8080;
    server_name example.local;

    # Dashboard team (Next.js, basePath: '/dashboard')
    location /dashboard {
        proxy_pass http://dashboard_next;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Request-Id $request_id;
    }

    # Storefront team (Nuxt, owns everything else)
    location / {
        proxy_pass http://storefront_nuxt;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Request-Id $request_id;
    }
}
```

Each app sets its base path so its assets and links resolve under its prefix:

- Next.js: `basePath: '/dashboard'` in `next.config.ts` (Next.js calls this pattern **Multi-Zones**).
- Nuxt: `app: { baseURL: '/shop/' }` in `nuxt.config.ts` when it does not own the root.

## Integrating Nuxt and Next.js

| Concern | Approach |
|---|---|
| Navigation between apps | Plain `<a href="/dashboard">` (full page load). Framework links (`NuxtLink`, `next/link`) only within the same app. Keep cross-app links in a shared config package |
| Authentication | One `HttpOnly`, `Secure`, `SameSite=Lax` session cookie on the shared domain (same host, `Path=/`). Both apps forward it to the API during SSR. Login and logout live in one app; the other redirects there |
| Authorization | Always in the backend; each app only adapts UI to roles fetched from the API |
| Shared look and feel | `packages/tokens` (CSS custom properties generated from one source) consumed by Nuxt UI and shadcn/ui themes. Components are implemented per framework; do not try to share them |
| Shared header/footer | Each app renders its own from shared tokens and a shared nav config; a Web Component only if it must be one implementation |
| Shared contracts | `packages/api-contracts` generated from OpenAPI (types + Zod schemas), versioned |
| Communication | Through the URL, the backend, or the session. Avoid runtime coupling. Same-page events (`CustomEvent`, `BroadcastChannel`) only for genuinely shared widgets |
| SSR and hydration | Each app hydrates only its own pages; no cross-framework hydration |
| Observability | Propagate `X-Request-Id`/trace headers through the proxy; tag RUM and logs with the app name |
| Versioning and deploys | Each app deploys independently; contracts follow semver with backward-compatible changes; proxy config changes are reviewed by the shell owner |

## Module Federation status (verified 2026-10)

- `@module-federation/nextjs-mf` (8.8.x): peer dependency `next ^12 || ^13 || ^14 || ^15`, **no Next 16**; supports Pages Router only (**not App Router**); its maintainers announced end of life, with CI coverage expected to stop around end of 2026. Do not recommend it for new work. Existing users: plan a migration to route-based composition.
- `@module-federation/vite` (1.x) and `@module-federation/enhanced` (2.x): maintained. Viable for **client-side** federation in Vite-based Vue or React SPAs owned by a mature platform team.
- The Module Federation team points React users needing federation with SSR to Modern.js; treat that as a framework change requiring an ADR.

## Nuxt 4 status (verified 2026-10-28)

Facts from the npm registry and the projects' own documentation on that date; re-check before deciding (`ecosystem-status.md`):

| Package | Version / date | What it means for a Nuxt 4 app |
|---|---|---|
| `@module-federation/nuxt` | 0.2.0, 2026-10-06, peer `nuxt >= 4.5.1`, described by its authors as beta | The only Module Federation integration for Nuxt 4. Apps below Nuxt 4.5.1 are outside its range; Nuxt 4.5 moved to Vite 8 / Rolldown, so meeting the peer range is itself an upgrade with risk. Shares `vue` and `vue-router` as singletons by default; Pinia, Nuxt UI, Tailwind and Nuxt aliases are not covered by its documentation. SSR of remotes runs remote server code with the host's privileges; configure trusted remotes only |
| `@module-federation/vite` | 1.23.6, 2026-10-27 (several releases per month) | Maintained; viable for **client-side** federation in Vite SPAs. "Nuxt SSR" was listed on its roadmap, not as a feature |
| `@module-federation/enhanced` / `runtime` | 2.9.2, 2026-10-28 | The core runtime; framework-agnostic |
| `@module-federation/nextjs-mf` | 8.8.76, peer `next ^12–^15`, Pages Router only, end of life announced | Not an option for the App Router or Next 16 |
| `single-spa` | 6.0.3, 2025-09 | Client-side orchestration; no Nuxt integration; SSR documented for React only |
| `@originjs/vite-plugin-federation` | 1.4.1, last release 2025-04, many open issues, no declared Vite 7/8 support | Not recommended for new work |

Structural facts that do not change with versions:
- **Two copies of Vue or Pinia on one page break.** Vue tracks the current instance in a module-level singleton; a remote that bundles its own Vue produces `Invalid VNode type` and `isCE of null` errors. Pinia injected into one app is invisible to another copy. Federation works only if `vue`, `vue-router`, `pinia`, `reka-ui` and the UI library are true singletons, and the Vite plugin does not enforce `strictVersion` on singletons.
- **Nuxt UI expects one `<UApp>` and one theme per page**: it provides toasts, tooltips and overlays through a single provider, and its colors are global CSS variables. Two bundles with different Nuxt UI versions on one page means two themes fighting and overlays that do not open.
- **The Nuxt team's position** (multi-app support is an open, long-running issue; `experimental.asyncEntry` exists to help federation; questions about microfrontends are answered with "use Layers") means there is no officially supported runtime composition in Nuxt 4 today. Layers share within one build (`nuxt-layers.md`); route-based composition shares across builds.

**Nominal compatibility is not production stability.** A plugin whose peer range accepts your Vite version, with no official example for your Nuxt minor, with singleton issues closed as "not planned" and with web documentation lagging its README, is a spike candidate, not an architecture. Recommend a time-boxed, reversible spike only after the readiness assessment passes, and write the acceptance criteria before starting it.

## Measurable criteria to reopen the decision

Write these into the ADR that rejects (or defers) microfrontends, with the measurement for each, so the decision reopens on evidence rather than on frustration. Reopen when **at least two hard criteria** hold **and all prerequisites** are met.

Hard criteria (organizational and product):

| # | Criterion | Example threshold | Measured with |
|---|---|---|---|
| C1 | Two or more teams own distinct frontend areas end to end, including review and on-call | `CODEOWNERS` per module and ≥ 80 % of commits per area by that team over a quarter | `git shortlog -sn -- app/modules/<x>`, CODEOWNERS |
| C2 | Release coupling is real | ≥ 3 times a month, for two months, a ready PR of one area waited more than a business day because of another area | PR labels, project board |
| C3 | An area needs different technology or rendering | A field-capture app needing offline mode; a public storefront needing SSR next to a client-only back office | Product decision on record |
| C4 | Isolation, compliance or scale differ by area | A plan or tenant requires that code of other modules is **not served**, or must be deployed separately | Contract or compliance requirement |

Prerequisites (technical; all required):

| # | Prerequisite | Checked by |
|---|---|---|
| R1 | Boundaries clean inside the app: dependency rules at `error` with no exceptions for a month; `domain-deps.mjs` shows no shell → domain and no shared → domain edges | CI |
| R2 | A versioned base package or layer (session, HTTP, errors, permissions, theme) consumed by at least two apps | Repository |
| R3 | Tests around the session core and guards; stable smoke E2E in CI | CI |
| R4 | One deployment pipeline per app with runtime configuration (not baked at build) | Pipeline |
| R5 | Observability per app: browser errors and web vitals tagged by app (`observability.md`) | Dashboards |
| R6 | A named owner for the shell, the proxy and the cross-app contracts | Written decision |

Technical signals that **do not** justify microfrontends by themselves but do justify looking again at structure, build and caching:
- startup JavaScript above ~250 KB gzip or entry CSS above ~60 KB gzip (`bundle-budget.mjs`),
- production build above ~15 minutes or recurring out-of-memory failures,
- typecheck above ~5 minutes or lint above ~3 minutes in CI,
- more than ~150 pages or ~12 business modules in the navigation.

Treat these first with route-level code splitting, bundle analysis, CI caching and, if several deployables exist, a monorepo with layers or packages, without changing how the product is deployed.

## Contracts that a split would break

Every contract below is free inside one application and becomes a versioned, tested agreement between apps or bundles the moment there are two. Use the table to size the hidden cost of microfrontends for your product, and as the list of what route-based composition must solve explicitly.

| Contract | In one application | With several apps or bundles |
|---|---|---|
| One user session | One store, one HTTP client, one refresh in flight | Each app repeats store and client; two refresh timers compete for one rotating refresh token; a session mechanism must be shared (same-site cookie) |
| Token refresh and 401 retry | One interceptor | One per app; the "session expired" navigation duplicates; a BFF or cookie session becomes almost mandatory |
| Tenant resolution | Derived once in core; branding in one state | Derived identically in every app; per-tenant origins complicate CSP and script origins for runtime federation |
| Effective permissions and guards | One permission matrix, one guard | The guard exists in every app or in a versioned shared layer; a remote with an older catalog shows or hides the wrong entries |
| Navigation and menus | One module table | The shell must know every app's screens: a manifest contract or a duplicated table |
| Logout atomicity and cache clearing | One function clears stores, query caches, storage and broadcasts to tabs | Each bundle clears its own; logout is no longer atomic; stale caches survive in other bundles |
| Request cancellation on navigation | One router, one abort policy | No coordination between apps; in-flight requests of the previous app resolve into nothing |
| Cross-tenant leak prevention | One origin per tenant, keys per user, full clear on logout | With a shared origin and several bundles each must clean its own storage keys |
| Error contract (how 422/403/5xx are shown) | One module plus a lint rule | A published package; an app on an old version renders errors differently |
| Design tokens and theme | One CSS file, one `<UApp>` | A tokens package consumed by every app; runtime composition additionally needs one provider on the page |
| Cross-domain operations | Navigation, core state, published contracts, backend events | Navigation and backend only; sharing a store across bundles is the anti-pattern that appears first |

Could each microfrontend deploy and upgrade without breaking these? Only if, before the split, there exist: a versioned base package, a screen manifest per app for menu and guards, a logout/cleanup protocol every app implements, and contract tests between shell and apps. None of them delivers user value until a second team exists.

## Monorepo tooling

| Tool | Choose when |
|---|---|
| pnpm workspaces | Always the base layer for JS monorepos |
| Turborepo | Few to tens of packages; you want task caching and pipelines with minimal configuration |
| Nx | Many projects and teams; you need the project graph, module boundary rules, generators and affected-only CI |

Share contracts, tokens and config. Do not share business logic through a "common" package.

## Anti-patterns

- Microfrontends because "the app is big" or "there are many modules".
- One microfrontend per component or per page.
- Sharing a Pinia/Zustand store across apps.
- Client-side runtime composition for SEO-critical pages.
- Different session mechanisms per app.
- Duplicating the design system per app instead of sharing tokens.
