# Microfrontends and monorepos

## Contents
- Default: do not split
- Readiness assessment
- Techniques compared
- Recommended: route-based composition behind a reverse proxy
- Integrating Nuxt and Next.js
- Module Federation status (verified)
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
