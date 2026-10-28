# Deployment and delivery

Where a frontend runs decides what it can do: rendering mode, caching, streaming, configuration and rollback all follow from the target. Decide the target with the rendering strategy (`rendering-strategies.md`), then apply the rules here. Observability of the running app: `observability.md`.

## Contents
- Choosing the target
- Targets and what they constrain
- Build output by framework
- Configuration: runtime versus build time
- One build, many environments
- Caching and CDN
- Rollback, previews, flags and canaries
- SSR servers: health, sizing, containers
- CI gates in order
- Secrets and headers
- Multi-tenant and multi-app delivery
- Anti-patterns

## Choosing the target

| Requirement | Static + CDN | Node server | Serverless | Edge |
|---|---|---|---|---|
| SEO with personalized or frequently changing content | No (SSG only) | Yes | Yes | Yes (runtime limits) |
| Authenticated panel, no SEO | **Yes** (`ssr: false`) | Yes | Yes | Rarely worth it |
| Realtime (SSE, WebSockets) from the app server | n/a | **Yes** | Not reliably | No |
| Predictable TTFB under bursty traffic | Yes | With autoscaling | Cold starts | Yes |
| Same artifact promoted across environments | Needs runtime `config.json` | Yes | Yes | Yes |
| Team can operate servers (sizing, memory, restarts) | Not needed | **Required** | Partly delegated | Delegated |
| Long builds or large dependencies | Fine | Fine | Size limits | Strict limits |

Choose the simplest target that meets the rendering decision; a Node server for a panel that never needed SSR is operational cost without benefit, and static hosting for an SEO product page with per-user prices is a correctness problem. Record the target in an ADR together with the rendering strategy.

## Targets and what they constrain

| Target | Rendering available | Caching | Long-lived connections | Config | Typical cost of mistakes |
|---|---|---|---|---|---|
| **Static hosting + CDN** (S3/CloudFront, Netlify, Pages, Nginx) | SSG, SPA (`ssr: false`); no per-request SSR | Immutable assets + HTML with short TTL; ISR only if the host supports it | n/a (the API handles them) | Baked at build (`NUXT_PUBLIC_*` in generated HTML, `NEXT_PUBLIC_*` inlined) or a runtime `config.json` fetched at start | Rebuild per environment, tenant baked in |
| **Node server** (container, VM, PaaS) | SSR, SSG, hybrid, streaming | Framework cache + CDN in front | SSE and WebSockets work (watch idle timeouts of the load balancer) | Runtime env vars | Capacity planning, cold deploys, memory leaks in SSR |
| **Serverless functions** (Lambda, Cloud Functions, Vercel/Netlify functions) | SSR per request with cold starts | CDN + framework cache; no shared in-process cache across instances | **Limited**: API Gateway buffers and cuts responses after ~30 s, so SSE from the function fails and the client must poll or use a dedicated realtime service | Runtime env vars | Cold starts on TTFB, function size limits, duplicated caches |
| **Edge runtime** | SSR with a restricted runtime (no Node APIs, size limits) | Closest to users | Streaming yes; long connections usually not | Runtime bindings | Library incompatibilities (crypto, fs, large deps) |

Decide from requirements: SEO and personalization need SSR or hybrid; an authenticated panel without SEO is often best as `ssr: false` on static hosting; realtime needs a target that keeps connections open or a separate realtime endpoint.

## Build output by framework

| Framework | Command | Output | Notes |
|---|---|---|---|
| Nuxt (Nitro) | `nuxt build` with a preset (`node-server` default; `static`, `vercel`, `netlify`, `cloudflare-pages`, `aws-lambda`, …) | `.output/server` + `.output/public` | The preset is a deploy decision: set it in `nuxt.config` (`nitro.preset`) or `NITRO_PRESET`; check the preset's docs for the installed Nitro version |
| Nuxt static | `nuxt generate` | `.output/public` with prerendered HTML | Public runtime config is baked into the HTML; `ssr: false` apps produce an SPA shell per route |
| Next.js | `next build` with `output: 'standalone'` | `.next/standalone` + `.next/static` + `public` | Standalone is the container-friendly output; copy `static` and `public` next to it |
| Next.js static | `output: 'export'` | `out/` | No Server Components at request time, no Server Functions, no ISR; only for sites that are fully static |

Keep the build **reproducible**: frozen lockfile, pinned Node version (`.nvmrc`/`engines`, `packageManager`), no network calls in the build except the registry, and the commit SHA injected as the release id.

## Configuration: runtime versus build time

| Mechanism | When it is read | Reaches the browser | Use for |
|---|---|---|---|
| Nuxt `runtimeConfig` (`NUXT_*` env) | At server start, per process | Only the `public` part | API base URLs, feature toggles, tenant domain, secrets (private part) |
| Nuxt `runtimeConfig.public` in a `nuxt generate` build | Baked into the generated HTML at build time | Yes | Same keys, but a value change needs a rebuild: generate once per environment or fetch a `config.json` at startup |
| Next `process.env` on the server | At request time in standalone builds | No | Secrets, API URLs |
| Next `NEXT_PUBLIC_*` | Inlined at build | Yes | Public values that may be baked; a change needs a rebuild |
| `app.config.ts` (Nuxt) | Bundled | Yes | Design tokens and UI configuration, never environment or secrets |
| Runtime `config.json` fetched before the app starts | At load | Yes | Static hosting that must promote one build across environments |

Rules: anything secret is private runtime config read on the server; public config is public by definition; the environment name itself is config, never a build flag that changes behavior silently; log the effective public config at startup in non-production.

## One build, many environments

Promote the **same artifact** from staging (gamma) to production: the build is tested once, the configuration changes. This requires runtime configuration (Node server or serverless) or, on static hosting, a runtime `config.json` per environment. Rebuilding per environment is acceptable only when the pipeline rebuilds from the same commit with the same lockfile and the difference is limited to public values; document it, because "it worked in gamma" then proves less.

Tenant-specific builds (one build per tenant) do not scale: tenant resolution belongs at runtime (`auth-session-tenant.md`).

## Caching and CDN

| Asset | Header | Why |
|---|---|---|
| Hashed assets (`/_nuxt/*.js`, `/_next/static/*`) | `Cache-Control: public, max-age=31536000, immutable` | The name changes with the content |
| HTML documents (SSG/SPA shell) | `Cache-Control: public, max-age=0, must-revalidate` or a short `s-maxage` with CDN invalidation on deploy | Users must get the new entry after a deploy |
| Personalized or authenticated HTML and API responses | `Cache-Control: private, no-store` | Never cache per-user content on a shared layer (`security.md`) |
| ISR/SWR pages | Framework-managed (`routeRules` `swr`/`isr`, Next cache profiles) plus CDN support for `stale-while-revalidate` | Freshness with cache hits |
| Fonts, images | Long TTL with hashed names or `@nuxt/image`/`next/image` defaults | Repeat visits |

CDN rules: cache key must include the headers that change the response (`Accept-Language`, cookie presence for personalized routes); do not vary on the full cookie for public pages or the hit ratio collapses; invalidate HTML paths on deploy (or rely on short TTL); keep the previous build's hashed assets available for a while so open tabs can still load chunks.

## Rollback, previews, flags and canaries

- **Rollback** is a configuration change, not a rebuild: keep the previous artifact (container tag, static build folder) and switch the pointer (service version, CDN origin path, alias). Target: minutes. Document the command.
- **Preview deployments** per pull request for product review, E2E and Lighthouse CI; they use a preview API or seeded data, never production data.
- **Feature flags** decouple deploy from release: server-evaluated flags for authorization-relevant behavior, client flags for UI experiments; every flag has an owner and a removal date; flags are tagged in telemetry.
- **Canary / percentage rollout** when the platform supports it (weighted routing, header-based routing for internal users); watch error rate per release before widening.
- **Forced refresh**: clients check the current build id on focus and after a chunk load error, then prompt a reload; otherwise stale tabs keep running old code against a new API.

## SSR servers: health, sizing, containers

- Health endpoints: liveness (`/health`, process alive) and readiness (`/ready`, can reach the API); Nuxt: `server/api/health.get.ts`; Next: a Route Handler. Keep them unauthenticated, cheap and excluded from logs and telemetry.
- Sizing: SSR CPU is per request; measure p95 render time under load and set replicas and memory limits from it; a memory leak in SSR (module-level caches, listeners) shows up as rising RSS between deploys (`state-audit.mjs`, `leak-patterns.mjs`).
- Graceful shutdown: stop accepting connections, finish in-flight renders, then exit; configure the platform's drain timeout above the slowest render.
- Timeouts: an upstream API timeout in SSR must be shorter than the proxy's timeout, and the page must degrade (render with an error state for that block) instead of failing the whole request.

**Container sketches (illustrative, not validated by this repository).** The two sketches below show the shape, not a production template: this repository does not build them, scan them or run them. Before adopting one, a team must (1) build it with the project's own package manager and Node version and run the image locally against the health endpoint, (2) confirm it runs as a non-root user with a read-only filesystem where possible, (3) add a `HEALTHCHECK` or the platform's probe pointing at `/health`, (4) check the image size and layer cache behavior (`pnpm fetch`/`pnpm install --offline` or `npm ci` with a separate dependency layer), (5) scan it with the registry's or CI's vulnerability scanner and pin the base image digest, and (6) verify that build-time secrets never enter a layer (`--mount=type=secret`, no `.env` in the context).

Container sketch for Nuxt (adjust Node and package manager to the project):

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

Next.js standalone (same caveat: illustrative): build with `output: 'standalone'`, then copy `.next/standalone` to the runtime image root, `.next/static` to `./.next/static` and `public` to `./public`, and run `node server.js`. Check the installed version's docs for the exact files, and apply the six checks above before using it.

## CI gates in order

1. Install with the frozen lockfile and the pinned Node version.
2. Typecheck (`nuxt typecheck` / `tsc --noEmit`), lint, format check.
3. Boundaries (dependency-cruiser or `eslint-plugin-boundaries`) and `contracts-check.mjs --baseline`; dead code (Knip) when adopted.
4. Unit and component tests with coverage thresholds that are realistic for the codebase.
5. Build (the same command the deploy uses) and `bundle-budget.mjs` on its output.
6. E2E smoke on the built app (Playwright) with `@axe-core/playwright` on key pages.
7. Lighthouse CI budgets on the preview deployment.
8. Deploy to staging, run the smoke suite against it, then promote.

A gate that is flaky gets fixed or quarantined, never ignored (`testing-scenarios.md`, anti-flaky rules).

## Secrets and headers

- Secrets live in the platform's secret store, injected as private runtime config; never in the repository, the image layers, `NEXT_PUBLIC_*`/`runtimeConfig.public` or build logs. Rotate when a secret touched a client bundle, even briefly.
- Security headers at the edge or server: CSP (report-only first), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`, permissions policy (`security.md`). Keep the policy in the repository (`nuxt-security`, `next.config` headers, or the CDK/Terraform of the CDN) so it is reviewed with the code and tested in CI.
- Source maps: upload to the error tool, do not serve publicly unless accepted.

## Multi-tenant and multi-app delivery

- **Subdomain per tenant**: wildcard certificate, CDN behavior that forwards the `Host` header, one static build or one SSR service for all tenants, tenant resolved at runtime; redirects and cookies scoped per origin.
- **Several apps on one domain** (route-based composition): the proxy or CDN maps path prefixes to apps; each app sets its base path; `X-Request-Id` and security headers are owned by the proxy; HTML invalidation per app; note the CDN's limits on behaviors and origins (`microfrontends.md`).
- **Monorepos**: build and deploy only affected apps (Turborepo/Nx affected graph); shared packages trigger all consumers' pipelines.

## Anti-patterns

- Two live deployment paths for one app (for example a container pipeline and a static pipeline): nobody knows which one is production, and configuration strategies diverge. Retire one.
- Baking the tenant or the environment into the bundle.
- `Cache-Control: public` on authenticated HTML; or no cache headers at all (the CDN decides for you).
- Rollback that rebuilds from an older commit under pressure.
- Health checks that hit the database or the API on every probe.
- SSE or WebSockets behind a gateway that cuts idle connections, without a fallback.
- Preview environments pointing at production data.

## Delivery checklist

- [ ] One deploy path per app, documented, with the rollback command
- [ ] Frozen lockfile, pinned Node and package manager, release id injected and visible in telemetry
- [ ] Runtime configuration for everything that differs per environment; secrets only in private config
- [ ] Cache headers per asset class; private responses `no-store`; previous build's assets kept during rollout
- [ ] Health (liveness) and readiness endpoints; graceful shutdown; upstream timeouts below the proxy's
- [ ] Preview deployments with non-production data; E2E, axe and Lighthouse CI run against them
- [ ] Security headers defined in the repository and verified in CI
- [ ] Stale-tab strategy: build id check and reload prompt on chunk load errors
- [ ] For multi-tenant and multi-app domains: tenant resolved at runtime, proxy owns request ids and headers, CDN behaviors reviewed by the shell owner
