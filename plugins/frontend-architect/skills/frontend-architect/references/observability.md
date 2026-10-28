# Frontend observability

You cannot improve what you only measured in the lab. This reference covers what a frontend should report from real users and servers, how to correlate it with the backend, and what must never be collected. Performance procedures: `performance.md`. Deployment and CI gates: `deployment.md`.

## Contents
- What to observe
- Tools (verified versions) and their cost
- Instrumentation by layer
- Instrumentation sketches
- Trace propagation and log correlation
- Errors: boundaries that report
- Privacy: sampling, scrubbing, consent
- Releases, source maps and alerts
- SLOs and budgets in CI
- Testing the instrumentation
- Checklist

## What to observe

| Signal | Why | Dimension |
|---|---|---|
| Web Vitals from the field (LCP, INP, CLS, TTFB) | Lab numbers do not survive real devices and networks | Route pattern, device class, connection, country, release |
| JavaScript errors and unhandled rejections | Silent failures look like "nothing happens" to users | Release, route, browser, user segment (not identity) |
| Hydration errors and SSR render failures | They degrade to client rendering or blank pages without a visible error | Route, release |
| API calls seen by the client: latency, status, timeouts, retries | The backend's p95 is not what the user waited for (DNS, TLS, proxy, cold start) | Endpoint pattern (not full URL), status, tenant |
| Long tasks and input delay | They explain poor INP better than any aggregate | Route, interaction name |
| Business events (search submitted, order approved) with duration | Product questions become answerable without a second tool | Feature, outcome |
| Resource failures (chunk load errors after a deploy, blocked third parties) | A stale tab after a deploy fails to load new chunks | Release |
| Console noise in production (warnings per page) | A proxy for quality rot | Route |

Dimensions carry the **release** (commit or build id), the **app** (when several apps share a domain) and the **tenant** where applicable. They never carry the user's name or the record being viewed.

## Tools (verified on npm, 2026-10-28) and their cost

| Tool | Role | Notes |
|---|---|---|
| `web-vitals` 6.x | Field Web Vitals with attribution (`onLCP`, `onINP`, `onCLS`, `onTTFB`), reported with `navigator.sendBeacon` | Tiny; the attribution build tells you *which* element or script caused the number |
| Sentry 11.x (`@sentry/nuxt`, `@sentry/nextjs`, `@sentry/vue`) | Errors with source maps, releases, performance traces, session replay | Replay and traces have privacy and cost implications: sample, mask by default |
| OpenTelemetry browser SDK | Vendor-neutral traces from the browser into your tracing backend | Heavier to set up; valuable when the backend already runs OTel and you want one trace per user action |
| Vendor RUM (Datadog, New Relic, Grafana Faro, Cloudflare/Vercel analytics) | Field vitals, errors and sessions with dashboards | Easiest start; check data residency and script weight |
| Lighthouse CI (`@lhci/cli` 0.15.x, last published 2025-06) | Lab budgets in CI | Lab only; it guards regressions, it does not describe users |

Rules: one RUM/error tool, loaded after the first paint (`useScript` in Nuxt, `next/script` with `afterInteractive`/`lazyOnload`); its weight is part of the performance budget; the SDK never blocks rendering.

## Instrumentation by layer

**Browser**
- Web Vitals reported per route pattern (`/orders/:id`, not `/orders/42`) with the attribution payload (LCP element selector, INP interaction target, CLS shifting element).
- Global handlers: `window.onerror`, `unhandledrejection`, Vue `app.config.errorHandler`, React error boundaries, framework hooks (Nuxt `vue:error` and `app:error`; Next `global-error.tsx`, `instrumentation-client` where available for the installed version).
- Chunk load failures after a deploy: detect `ChunkLoadError`/`Failed to fetch dynamically imported module`, report once, offer a reload (and version-check the app on focus).
- Feature flags: tag every event with the flag variants active at the time, otherwise a bad variant looks like a random regression.

**SSR server (Nitro, Next server)**
- Structured JSON logs with per-request context: request id, route, status, duration, tenant, release. No bodies, no cookies, no tokens.
- Render errors and upstream API failures as events with the request id.
- Server-side timing (`Server-Timing` header) for the upstream calls so the browser trace shows where the TTFB went.

**Edge / proxy**
- Generate the request id if missing, add it to logs and forward it; export cache hit ratio, 5xx and latency per path prefix (per app in route-based composition, `microfrontends.md`).

**Nuxt**: plugins (`.client.ts` for RUM, server plugin for request logging), `nitro` hooks for request/response, `useRequestEvent()` for the request id during SSR. **Next.js**: `instrumentation.ts` for server-side setup, `proxy.ts` to add the request id header, `reportWebVitals`/`useReportWebVitals` from `next/web-vitals` for field vitals.

## Instrumentation sketches

Shapes to adapt, not libraries to add; check the installed versions' docs for exact hook names.

**Field vitals with a route pattern (browser, both frameworks)**

```ts
import { onCLS, onINP, onLCP, onTTFB } from 'web-vitals/attribution'

export function startVitals(report: (event: Record<string, unknown>) => void, routePattern: () => string) {
  const send = (metric: { name: string; value: number; rating: string; attribution?: unknown }) =>
    report({ type: 'vital', name: metric.name, value: metric.value, rating: metric.rating, route: routePattern(), release: __RELEASE__, attribution: metric.attribution })
  onLCP(send)
  onINP(send)
  onCLS(send)
  onTTFB(send)
}
```

`report` batches and uses `navigator.sendBeacon` on `visibilitychange`; `routePattern` returns the matched route (`route.matched[0].path` in Vue Router, the segment pattern in Next.js), never the concrete URL; `__RELEASE__` is injected at build time.

**Nuxt**: a `.client.ts` plugin calls `startVitals` after `app:mounted`; `nuxtApp.hook('vue:error', ...)` and `nuxtApp.hook('app:error', ...)` report errors with the route; a Nitro plugin (`server/plugins/`) hooks `request`/`afterResponse` (names per the installed Nitro version) to emit one structured log line per request with the request id from `event.node.req.headers['x-request-id']` (or generated), route, status and duration; the per-request HTTP client forwards that id (`axios.md` plugin pattern, add the header next to the cookie).

**Next.js**: `useReportWebVitals` from `next/web-vitals` in a small Client Component mounted in the root layout; `instrumentation.ts` for server SDK setup; `proxy.ts` sets `x-request-id` on the request headers when missing; Server Components and Server Functions read it from `headers()` and pass it upstream; `error.tsx` and `global-error.tsx` call the reporter in an effect with the route segment.

**Dashboards per app** when several apps share a domain (route-based composition): one dashboard per app filtered by the `app` tag with the same panels (vitals by route, errors by release, API errors by endpoint pattern), plus one shared panel for the proxy (5xx and latency by path prefix). Without the `app` tag, a regression in one team's app looks like everybody's problem.

## Trace propagation and log correlation

```
browser ──X-Request-Id/traceparent──▶ proxy ──▶ Nuxt/Next SSR ──▶ API
   │                                   │             │             │
 RUM event(request id)           access log      server log     API log + trace
```

- The proxy or edge creates `X-Request-Id` (or a W3C `traceparent`) when missing and passes it down; SSR forwards it on every upstream call, together with the cookie it already forwards (`nuxt.md`, `axios.md`).
- The browser sends the same id on its own API calls (a header set in the HTTP client, generated per page load or per interaction) and tags the RUM event with it. With OpenTelemetry, the fetch instrumentation does this through `traceparent`; the API must allow that header in CORS.
- Logs on every hop include the id; one search answers "what happened to this user's click".
- Keep ids opaque; never encode user or tenant in them.

## Errors: boundaries that report

- Every boundary (Nuxt `<NuxtErrorBoundary>`, `error.vue`; Next `error.tsx`, `global-error.tsx`) reports the error with the route and the component tree position, then renders the recovery UI from `design-systems.md` (what happened, what to do, retry).
- Normalize errors before reporting: the `ApiError.kind` from `api-clients.md` becomes a tag; expected kinds (`canceled`, `validation`, `unauthorized` after expiry) are **not** reported as errors, they are metrics.
- Group by fingerprint that excludes ids and dynamic text, otherwise every order id becomes a new issue.
- Attach breadcrumbs the tool collects (navigation, clicks, fetches) but mask inputs and URLs with ids.
- Set `ignoreErrors` for browser-extension noise and third-party script failures you cannot act on; review the ignore list each release.

## Privacy: sampling, scrubbing, consent

- **Sampling**: errors 100% (they are rare), traces and replays a few percent and 100% on errors; Web Vitals 100% or a fixed sample above the volume where percentiles stabilize.
- **Scrubbing before sending**: strip query strings that may carry names or emails, mask form values, drop request and response bodies, hash user ids if a user dimension is needed at all. Configure the SDK's `beforeSend`/`beforeBreadcrumb` and test it (below).
- **Consent**: analytics and replay behind the consent manager where regulation applies; error reporting and vitals usually count as strictly necessary, but the privacy policy must say so. Load nothing before consent is known when a gate exists.
- **PHI and financial data** never appear in events, replays, breadcrumbs or logs; replay stays off on clinical and payment screens (`auth-session-tenant.md`).
- **Retention**: match the tool's retention to the legal requirement; longer is not better.

## Releases, source maps and alerts

- Tag every event with the release id (commit SHA or build number) and the environment; upload source maps for that release to the error tool during the build and keep them out of the public bucket (or protect them). Without this, production stack traces are minified noise.
- Deploy markers in dashboards: a regression right after a marker is a rollback candidate before it is an investigation.
- Alerts that page someone: error rate per release above baseline for N minutes, LCP p75 of a key route above budget for a sustained window, API 5xx seen by clients, chunk load errors spike. Alerts that only notify: new issue types, budget warnings, consent-rate changes.
- Alert on **rates and percentiles**, not counts, and per app in a multi-app domain.

## SLOs and budgets in CI

Example field SLOs for a B2B app (adjust per product): LCP p75 ≤ 2.5 s and INP p75 ≤ 200 ms on the three most visited routes, JS error rate ≤ 0.5% of sessions, API error rate seen by clients ≤ 1% excluding 4xx caused by the user, chunk load failures ≈ 0 outside deploy windows.

Lab guard rails in CI: Lighthouse CI with a budgets file (`assets/lighthouse-budgets.json` is a starting point: resource sizes and timings per route pattern), and `bundle-budget.mjs` on the production build output (startup JS/CSS gzip, largest chunk). A `lighthouserc` configuration points `assert.budgetsFile` at the budgets file and `collect.url` at the preview deployment; fail the job on budget breaches, warn on score drops.

## Testing the instrumentation

- Unit: the scrubbing functions (`beforeSend`) given a payload with an email in the URL and a token in a header return a payload without them.
- Playwright: intercept the telemetry endpoint (`page.route`) and assert that a navigation produces a vitals event with the right route pattern and release, that a forced error produces one error event with a fingerprint and no PII, and that no event is sent before consent when a gate exists.
- SSR: a request with `X-Request-Id: test-123` produces a server log line containing it and an upstream call carrying it (assert against a mock backend as in the repository's SSR test).
- Chaos: block the telemetry host in a test and verify the app behaves identically (telemetry failures must be invisible).

## Checklist

- [ ] Field Web Vitals per route pattern and release, with attribution
- [ ] Errors with source maps, release tags, fingerprints without ids, expected kinds excluded
- [ ] Request id propagated browser → proxy → SSR → API and present in all logs
- [ ] Structured SSR logs without cookies, tokens, bodies or PHI
- [ ] Scrubbing tested; replay off on sensitive screens; consent respected
- [ ] Alerts on rates and percentiles per release and per app
- [ ] Lighthouse CI budgets and `bundle-budget.mjs` in the pipeline
- [ ] Telemetry SDK loaded after first paint and counted in the performance budget
