# Testing scenarios: the adversarial catalog

`testing.md` sets the strategy and the tools. This reference lists the scenarios that find real production bugs, each with what to test, how, and what a pass proves. Pick the rows that match the app; do not run the whole catalog on a five-page site. Code marked `@verify` is compiled and run in this repository's CI.

## Contents
- How to use the catalog
- Contracts and data
- Accessibility, visual and responsive
- Performance and security
- Concurrency and races (tested guards)
- Sessions, permissions and tenants
- Rendering: hydration and SSR
- Failure recovery and resources
- Fixtures and factories
- Anti-flaky rules
- Minimal matrix by app type

## How to use the catalog

Each scenario names the cheapest layer that can prove it: unit (Vitest, pure functions), component (Vitest + Testing Library or `@nuxt/test-utils`), integration (component + MSW), E2E (Playwright on a production build). Prefer the cheapest layer; use E2E for the journey, not for every variant. Respect the runners already installed (`testing.md`, "Tooling by project").

## Contracts and data

| Scenario | How | A pass proves |
|---|---|---|
| **API contract drift** | Schemas in the service (`parseResponse`, `axios.md`) plus a test that validates recorded or generated responses against the OpenAPI document; with OpenAPI, generate types and MSW handlers from the spec so the mock cannot drift from the contract | A backend change surfaces as a `contract` error at the boundary in CI, not as `undefined` in the UI |
| **Response shape at the boundary** | Service test with a wrong payload (`users.service.test.ts` in `axios.md`) | Validation rejects before data enters the app |
| **Optimistic update rollback** | Mutation test: `onMutate` applies, mutation rejects, cache equals the snapshot afterwards (`pinia-colada.md`) | Failures never leave phantom rows |
| **Pagination and URL state** | Component test: changing page updates the query string; loading the URL restores page, sort and filters | Links and the back button work |
| **Empty, error, partial, loading** | Component test per state with MSW responses (empty list, 500, slow) and assertions on roles and text | Every data view implements the five states (`design-systems.md`) |

## Accessibility, visual and responsive

| Scenario | How | A pass proves |
|---|---|---|
| **Automated a11y on key pages** | `@axe-core/playwright` (4.14.x) after each page settles; fail on `serious` and `critical`; one run per color mode | No obvious violations ship (about a third of real issues) |
| **Keyboard-only journey** | Playwright: `Tab`/`Shift+Tab`/`Enter`/`Escape` through login → main task → dialog → submit; assert focus position after each step and after navigation | Dialogs trap and return focus; nothing needs a mouse |
| **Screen-reader names** | Component tests query by role and accessible name only (`getByRole('button', { name: 'Save' })`) | Renaming or unlabeling a control breaks a test |
| **Visual regression** | Playwright `toHaveScreenshot` on a design-system page and the three key screens, with animations disabled (`reducedMotion: 'reduce'`, CSS to stop transitions), fonts awaited (`document.fonts.ready`), fixed dates and seeded data, one browser and OS per baseline | Unintended visual changes are caught; intended ones update the baseline in the same PR |
| **Responsive matrix** | Viewports 320×568, 375×812, 768×1024, 1280×800, 1920×1080 plus 200% zoom (`deviceScaleFactor` or CSS zoom); assert no horizontal scroll and that primary actions are visible | Layouts hold at the extremes WCAG expects |
| **Reduced motion** | Emulate `prefers-reduced-motion: reduce`; assert no scroll-jacking, no autoplay, instant state changes (`creative-frontend` skill) | Motion is an enhancement |

## Performance and security

| Scenario | How | A pass proves |
|---|---|---|
| **Budgets** | Lighthouse CI with `assets/lighthouse-budgets.json` on the preview; `bundle-budget.mjs` on the build output | Regressions fail the PR, not the release |
| **No waterfall on the key route** | Playwright: record requests on navigation; assert independent calls overlap (start times within a window) | Data loads in parallel (`performance.md`) |
| **CSP compliance** | Run E2E with `Content-Security-Policy-Report-Only` and a `report-to` endpoint intercepted by `page.route`; assert zero violations | The strict policy can be enforced |
| **XSS payloads** | Component tests render user content containing `<img onerror>` and `javascript:` links through the real sanitizer; assert the DOM has no handler attributes and links are neutralized | The sanitizer configuration is what the app uses |
| **No token in storage** | E2E after login: `localStorage`, `sessionStorage` and `document.cookie` contain no token-like values; the session cookie is `HttpOnly` (check via the browser context's cookie API) | The session model from `auth-session-tenant.md` holds |
| **403 handling** | MSW returns 403 for a resource; assert the forbidden state, invalidation and redirect behavior | Revocation is handled, not swallowed |

## Concurrency and races (tested guards)

| Scenario | How | A pass proves |
|---|---|---|
| **Two concurrent 401s** | `client.test.ts` in `axios.md`: one refresh, both requests retried, no loop on refresh failure | Session refresh is single-flight |
| **Stale response overwrites newer state** | Unit test of the guard below; component test typing `ma` then `mar` with the first response delayed | The UI shows results for the last query |
| **Double submit** | Unit test of `singleFlight`; component test clicking Save twice while pending | One request per intent; the button is disabled or ignored |
| **Route changed mid-request** | Component test: unmount while a request is pending; assert no state update warnings and the request's signal is aborted | Navigation cancels work |
| **Request order on reconnect** | Integration test with MSW delaying responses out of order | Ordering assumptions are explicit |

```ts
// @verify vue:lib/async/latest-only.ts
/**
 * Race-condition guards for user-driven requests (search-as-you-type, filters, tab switches).
 * `latestOnly` drops results of calls that were superseded; `latestWithAbort` also cancels them.
 */
export type LatestResult<T> = { stale: true } | { stale: false; value: T }

export function latestOnly<Args extends unknown[], T>(fn: (...args: Args) => Promise<T>) {
  let current = 0
  return async (...args: Args): Promise<LatestResult<T>> => {
    const ticket = ++current
    const value = await fn(...args)
    return ticket === current ? { stale: false, value } : { stale: true }
  }
}

export function latestWithAbort<Args extends unknown[], T>(fn: (signal: AbortSignal, ...args: Args) => Promise<T>) {
  let controller: AbortController | null = null
  return (...args: Args): Promise<T> => {
    controller?.abort()
    controller = new AbortController()
    return fn(controller.signal, ...args)
  }
}

/** Prevents double submits: while one call is in flight, later calls receive the same promise. */
export function singleFlight<Args extends unknown[], T>(fn: (...args: Args) => Promise<T>) {
  let inFlight: Promise<T> | null = null
  return (...args: Args): Promise<T> => {
    inFlight ??= fn(...args).finally(() => {
      inFlight = null
    })
    return inFlight
  }
}
```

```ts
// @verify vue:lib/async/latest-only.test.ts
import { describe, expect, it, vi } from 'vitest'
import { latestOnly, latestWithAbort, singleFlight } from './latest-only'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('race-condition guards', () => {
  it('latestOnly marks a slow earlier call as stale when a later call already finished', async () => {
    const first = deferred<string[]>()
    const second = deferred<string[]>()
    const calls = [first, second]
    const search = latestOnly((_q: string) => calls.shift()!.promise)

    const a = search('ma')
    const b = search('mar')
    second.resolve(['maria'])
    first.resolve(['mateo', 'maria'])

    expect(await b).toEqual({ stale: false, value: ['maria'] })
    expect(await a).toEqual({ stale: true })
  })

  it('latestWithAbort aborts the previous signal before starting the next request', async () => {
    const seen: AbortSignal[] = []
    const load = latestWithAbort(async (signal: AbortSignal, id: number) => {
      seen.push(signal)
      return id
    })
    await load(1)
    await load(2)
    expect(seen[0]?.aborted).toBe(true)
    expect(seen[1]?.aborted).toBe(false)
  })

  it('singleFlight shares one in-flight call and allows a new one afterwards', async () => {
    const submit = vi.fn(async () => 'ok')
    const guarded = singleFlight(submit)
    await Promise.all([guarded(), guarded(), guarded()])
    expect(submit).toHaveBeenCalledTimes(1)
    await guarded()
    expect(submit).toHaveBeenCalledTimes(2)
  })
})
```

Query libraries already cancel superseded queries through the `signal` they pass to the query function; these guards are for imperative calls (event handlers, autocomplete services, form submits).

## Sessions, permissions and tenants

| Scenario | How | A pass proves |
|---|---|---|
| **Expired session during a form submit** | E2E: fill a form, expire the session (MSW/fixture endpoint invalidates it), submit; assert the draft survives, login is shown with `returnTo`, and after login the submit completes once (idempotency key) | No lost work, no duplicate writes |
| **Expired session with many requests in flight** | Component/integration test with MSW: dashboard with six queries, all 401 → one refresh call (count handler hits) → six retries | Single-flight at the app level, not only in a unit |
| **Permission revoked mid-session** | Unit test below; integration test: matrix refetched, forbidden queries removed, user navigated away | One reaction per burst |
| **Logout clears everything** | E2E: log in as A, visit three domains, log out, log in as B in the same tab; assert no A data in the DOM and no request with A's ids (`page.on('request')`) | Logout protocol from `auth-session-tenant.md` |
| **Tenant switch** | Unit test below; E2E: switch organization, assert caches cleared (no request skipped because of a warm cache for the old tenant) and keys scoped | Tenant isolation in client state |
| **Cross-tenant isolation** | Two Playwright browser contexts logged into two tenants, same flows; assert each context never receives the other tenant's identifiers | Server and client scoping together |
| **Literal roles** | `routes-audit.mjs` → zero `hardcoded-role-check` findings as a CI assertion | Permissions come from the matrix |

```ts
// @verify vue:lib/tenant/scoped-state.test.ts
import { describe, expect, it, vi } from 'vitest'
import { TenantScopedState, storageKey, tenantKey } from './scoped-state'

describe('tenant scoping', () => {
  it('keys carry the tenant so two organizations never share a cache entry', () => {
    expect(tenantKey('acme', ['patients', 'list'])).toEqual(['tenant', 'acme', 'patients', 'list'])
    expect(tenantKey('acme', ['patients'])).not.toEqual(tenantKey('globex', ['patients']))
    expect(storageKey('acme', 'u1', 'draft')).toBe('app:acme:u1:draft')
  })

  it('switching tenant clears state (not hides it) and notifies subscribers once', () => {
    const state = new TenantScopedState()
    const onSwitch = vi.fn()
    state.onSwitch(onSwitch)

    state.switchTo('acme')
    state.set('patients', [{ id: 1 }])
    expect(state.get('patients')).toEqual([{ id: 1 }])

    state.switchTo('globex')
    expect(state.get('patients')).toBeUndefined()
    expect(state.size).toBe(0)

    state.switchTo('acme')
    expect(state.get('patients')).toBeUndefined()
    expect(onSwitch).toHaveBeenCalledTimes(3)
    expect(onSwitch).toHaveBeenLastCalledWith('acme')
  })

  it('logout (tenant null) empties everything and writes are refused', () => {
    const state = new TenantScopedState()
    state.switchTo('acme')
    state.set('k', 1)
    state.switchTo(null)
    expect(state.size).toBe(0)
    expect(() => state.set('k', 2)).toThrow(/No active tenant/)
  })
})
```

```ts
// @verify vue:lib/auth/forbidden-handler.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createForbiddenHandler } from './forbidden-handler'

describe('permission revoked mid-session', () => {
  it('reacts once to a burst of concurrent 403s and ignores other errors', async () => {
    const deps = { invalidateAll: vi.fn(), notify: vi.fn(), redirect: vi.fn() }
    const handle = createForbiddenHandler(deps)

    const handled = [1, 2, 3].map(() => handle({ kind: 'forbidden', status: 403 }, '/projects/42'))
    expect(handled).toEqual([true, true, true])
    expect(deps.invalidateAll).toHaveBeenCalledTimes(1)
    expect(deps.redirect).toHaveBeenCalledWith('/no-access?from=%2Fprojects%2F42')
    expect(handle({ kind: 'not_found', status: 404 }, '/projects/42')).toBe(false)

    await Promise.resolve()
    handle({ kind: 'forbidden', status: 403 }, '/billing')
    expect(deps.invalidateAll).toHaveBeenCalledTimes(2)
  })
})
```

The implementations under test (`scoped-state.ts`, `forbidden-handler.ts`) are in `auth-session-tenant.md`.

## Rendering: hydration and SSR

| Scenario | How | A pass proves |
|---|---|---|
| **No hydration warnings** | E2E on key pages: collect `console` messages during load; fail on `Hydration` / `mismatch` text (Vue and React wording differs; match both) | Server and client render the same tree |
| **Content without JavaScript** | Playwright context with `javaScriptEnabled: false` (or `curl`) on SEO routes; assert the main content and metadata are in the HTML | SSR/SSG actually renders (`nuxt.md`, `nextjs.md`) |
| **Cross-request leak** | The repository's `verification/ssr-test`: N concurrent requests with different session cookies against a mock API; assert each response contains only its own user | No module-level per-user state on the server |
| **Client-only widgets** | E2E: the `<ClientOnly>`/`dynamic(..., { ssr: false })` widget shows its fallback in the no-JS HTML and the real content after hydration, with the same box size | No layout shift from client-only parts |
| **Lazy hydration** | E2E: below-the-fold interactive component has no handlers until visible (click does nothing before scroll, works after) | Hydration strategy applied and still functional |

## Failure recovery and resources

| Scenario | How | A pass proves |
|---|---|---|
| **Offline → online** | Playwright `context.setOffline(true)`, trigger a fetch, assert the error state with retry, go online, retry succeeds | Network failures are states, not crashes |
| **500 and timeout** | MSW `HttpResponse` 500 and a delayed response beyond the client timeout; assert the error kind, the retry affordance and that reads were retried by the query layer only (count handler hits) | One retry policy (`api-clients.md`) |
| **Chunk load failure after deploy** | E2E: block a lazy chunk URL; navigate; assert the recovery prompt (reload) instead of a blank page | Deploys do not strand open tabs (`deployment.md`) |
| **Memory leak on mount/unmount** | Component test with fake timers: mount and unmount 50 times, then assert `vi.getTimerCount()` is 0 and spied `addEventListener`/`removeEventListener` counts match; E2E: Playwright CDP `getEventListeners` on `window` before and after visiting a route ten times | Cleanup runs (`leak-patterns.mjs` lists candidates) |
| **Pseudo-locale** | Run the app with a pseudo-locale (accented, 30% longer strings, RTL variant) in a visual test | Layouts survive translation (`i18n.md`) |

## Fixtures and factories

- **Typed builders** per entity (`buildUser({ role: 'editor' })`) with sensible defaults and a seeded random (fixed seed per test file), living next to the schemas so they fail to compile when the contract changes.
- **MSW handlers per feature** (`features/orders/__tests__/handlers.ts`) built from the builders; tests override one handler for the scenario (`server.use(...)`) and reset after each test. MSW 3.x in Node for Vitest and in the browser for Playwright when the API is not available.
- **Playwright fixtures**: one authenticated `storageState` per role and per tenant created once in a global setup; tests pick the fixture (`test.use({ storageState: 'editor-acme.json' })`); never log in through the UI in every test.
- **Seeded backend** for E2E when available (reset endpoint or database snapshot); otherwise MSW at the browser level with the same handlers as the component tests.
- **Time, randomness and locale fixed**: `vi.useFakeTimers({ now })`, `vi.spyOn(Math, 'random')`, Playwright `timezoneId` and `locale`, dates in fixtures as ISO strings.
- **Network recording** (HAR) only for third-party widgets you cannot mock; review and commit the HAR.

## Anti-flaky rules

1. No `sleep`/`waitForTimeout`: await a UI state (`expect(locator).toBeVisible()`), a response (`page.waitForResponse`), or a network-idle condition scoped to the action.
2. Deterministic inputs: time, random, locale, timezone, viewport, fonts loaded, animations disabled in visual tests.
3. Isolated network: tests never depend on third parties or on shared mutable environments; each test creates what it reads.
4. Unique data per test (suffix with the test id) so parallel workers never collide.
5. Retries only at the job level (Playwright `retries` ≤ 2 in CI) and every retried test is logged and quarantined (`test.fixme` with an issue link) until fixed; a retried pass is a failure in disguise.
6. Trace, video and screenshot on failure (`trace: 'on-first-retry'`), uploaded as CI artifacts.
7. One assertion style: role-based locators, no CSS classes tied to styling, no `nth-child` on reorderable lists.
8. Clock-dependent features (expiry, countdown) tested with fake timers, not by waiting.

## Minimal matrix by app type

| App | Must have | Add when |
|---|---|---|
| Marketing / content site (stage 0) | No-JS content check, axe on templates, Lighthouse budgets, visual regression of templates | Forms: contract + a11y of the form |
| Product app (stage 1) | Service contract tests, store/composable tests, component tests for the five states, 3–5 Playwright journeys with axe, hydration warnings check, budgets | Auth: expired session + logout; realtime: reconnect |
| Multi-tenant SaaS | Everything above plus tenant switch, cross-tenant isolation (two contexts), permission revocation, no-token-in-storage, CSP report-only in E2E | PHI/financial: idle lock, replay off, print/export checks |
| Dashboard / high-traffic | Budgets per key route, no-waterfall check, lazy hydration, offline/500/timeout states, memory leak loop on the heaviest route | SSR: cross-request leak test in CI |
| Design system package | Visual regression per component and state, axe per story, keyboard tests for interactive primitives | Theming: both color modes and 200% zoom |
