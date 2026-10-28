# Authentication, sessions, authorization UX and multi-tenancy

How a frontend holds a session, reacts to its end, adapts to permissions and keeps tenants apart. The backend remains the only authority: everything here is user experience and leak prevention, not enforcement. Threats and headers: `security.md`. Storage choices: `persistence.md`. Tested client code: `axios.md`, `testing-scenarios.md`.

## Contents
- Session models compared
- Libraries by framework (verified versions)
- OAuth 2.1 and OIDC in browser apps
- Refresh, 401 retry and expiry UX
- Logout everywhere
- Step-up authentication and MFA in the UI
- Authorization in the client is UX
- Permission revoked mid-session
- Multi-tenancy in the frontend
- Sensitive data (PHI, PII, financial)
- Nuxt and Next.js specifics
- Anti-patterns and migration from tokens in localStorage

## Session models compared

| Model | Where the credential lives | XSS exposure | CSRF work | SSR | Use when |
|---|---|---|---|---|---|
| **Backend cookie session** (default) | `HttpOnly; Secure; SameSite=Lax` cookie set by the API or a gateway | None (JS cannot read it) | `SameSite` + `Origin` check or CSRF token for cookie-authenticated mutations | Forward the cookie per request | The API and the frontend share a site (same registrable domain) |
| **BFF session** | Tokens (access, refresh, id) stay in the Nuxt/Next server; the browser gets a sealed or opaque `HttpOnly` cookie | None | Same as above | Native: the server already holds the tokens | Third-party identity provider, several upstream APIs, tokens that must never reach the browser |
| **Tokens in memory + refresh cookie** | Access token in a JavaScript variable (per app instance, never module-level on the server); refresh token in an `HttpOnly` cookie scoped to the refresh endpoint | Access token readable by injected script while the page lives; refresh token safe | Refresh endpoint needs CSRF protection | Access token must be re-obtained per request on the server | No backend can hold the session (pure SPA against a public OAuth client) |
| **Tokens in `localStorage`** | Readable by any script forever | Full account takeover on any XSS, persists across reloads | None, but that is not a feature | Not available during SSR | Never for new code; see the migration path at the end |

Decision: cookie session when the API can set it; BFF when there is an identity provider or several APIs; in-memory tokens only when neither is possible, documented in an ADR with the compensating controls (strict CSP, short token lifetime, refresh rotation).

## Libraries by framework (verified on npm, 2026-10-28)

| Need | Nuxt / Vue | Next.js / React |
|---|---|---|
| BFF session with sealed cookie, OAuth providers, WebAuthn | `nuxt-auth-utils` 0.5.x (`useUserSession`, `setUserSession`, `requireUserSession` in Nitro) | Auth.js (`@auth/core` 0.41.x; note that the `next-auth` package's `latest` tag is still the 4.24.x line: check which line the project installs before following docs) |
| Framework-agnostic auth server with first-party client SDKs | Better Auth 1.7.x (Vue and Next peers) | Better Auth 1.7.x |
| Security headers, CSP nonces, rate limits in Nitro | `nuxt-security` 2.7.x | Headers in `next.config` or `proxy.ts`; CSP nonce via `proxy.ts` |
| Identity provider SDKs (Auth0, Clerk, WorkOS, Cognito, Keycloak) | Provider SDK or OIDC client; prefer the BFF flow where the SDK supports it | Same |

Rules: one session mechanism per site, even with several apps behind a proxy (`microfrontends.md`); the library's version decides the API, read its docs for the installed major; never hand-roll token parsing or storage when a maintained library covers the flow.

## OAuth 2.1 and OIDC in browser apps

- **Authorization Code with PKCE** is the only flow for browser clients. The implicit flow (tokens in the URL fragment) is removed in OAuth 2.1: tokens leak through history, referrers and logs, and cannot be refreshed safely.
- **Where the code is exchanged decides the model.** Exchanged by the Nuxt/Next server or the API: BFF or backend session (tokens never reach the browser). Exchanged by the browser: public client, tokens in memory, refresh token rotation required.
- **The callback route is thin.** It validates `state` (CSRF for the login flow) and, for OIDC, the `nonce` in the id token; it exchanges the code (server side) and redirects to a validated `returnTo` path. Keep one callback per provider, under `/auth/callback/<provider>`.
- **`code_verifier` and `state` live only for the duration of the dance**, in `sessionStorage` or a short-lived cookie, and are deleted after the callback. They are not secrets worth protecting beyond that window.
- **`returnTo` is an open-redirect vector.** Accept only relative paths that start with `/` and not `//`, or match an allowlist; never a full URL from the query string (`security.md`).
- **One login page per site.** With several apps behind a proxy, one app owns `/login`, `/logout` and the callbacks; the others redirect there and share the cookie (`microfrontends.md`).
- **Logout with the provider**: end the local session first, then redirect to the provider's end-session endpoint when the product requires single logout; otherwise the provider session stays and the next login is silent, which may or may not be wanted.

## Refresh, 401 retry and expiry UX

Mechanics (tested implementation in `axios.md`, `createHttpClient`):
- One refresh in flight for any number of concurrent 401s; every failed request retries **once** after a successful refresh; a failed refresh ends the session without a loop.
- Refresh never lives in module-level state on the server. On SSR the request carries the cookie; the server forwards it and does not refresh on behalf of the user unless the BFF owns the tokens.
- Proactive refresh (a timer before expiry, on `visibilitychange`) reduces visible 401s; the reactive path must still exist because timers do not run in background tabs.
- Distinguish **identity rejected** (401 or 403 from the refresh endpoint: end the session) from **network failure** (keep the session, retry later). Losing connectivity is not a logout.

Experience when the session ends:

| Situation | Behavior |
|---|---|
| Expiry while reading | Redirect to `/login?reason=expired&returnTo=<path>`; after login, return to the same path and restore URL state (filters, tab) |
| Expiry during a form submit | Keep the draft (memory or a persisted draft with expiry, `persistence.md`), authenticate, then resubmit with an idempotency key so the server deduplicates (`api-clients.md`) |
| Idle user in a sensitive app (clinical, financial) | Idle lock after N minutes: overlay that hides content, requires password or passkey, keeps the page state; log the lock as an event |
| Warning before expiry | Non-blocking banner a few minutes before, with a "stay signed in" action that refreshes |
| Several tabs | One tab's refresh serves all (cookie); one tab's logout propagates through `BroadcastChannel` (below) |

## Logout everywhere

Logout is a protocol, not a redirect. Checklist, in order:

1. **Server**: revoke the session or refresh token; the response clears the cookies (`Set-Cookie` with `Max-Age=0`).
2. **Query cache**: remove every query (TanStack Query `queryClient.clear()`; Pinia Colada: use the query cache's removal or invalidation API for the installed version). A cache that survives logout serves the next user on a shared device.
3. **Stores**: reset each store (option stores: `$reset()`; setup stores need an explicit `reset()` action; Zustand: `setState(initial, true)`).
4. **Module-level caches**: any `Map`, memoized promise or singleton that kept user data (the `state-audit.mjs` report lists them). If they cannot be cleared, a full page reload after logout is the honest fix.
5. **Persisted state**: remove user- and tenant-scoped keys (`storageKey(tenant, userId, name)` below); keep only device preferences (theme, language).
6. **Nuxt**: `clearNuxtState()` and `clearNuxtData()`; Next: nothing global, so the providers must expose reset functions.
7. **Connections**: close `EventSource`/`WebSocket` and stop polling timers.
8. **Other tabs**: post `{ type: 'logout' }` on a `BroadcastChannel`; receivers run steps 2–7 and navigate to login.
9. **Navigation**: go to the login page; a hard navigation (`location.assign`) is acceptable when the app cannot prove step 4.

Test: log in as A, open three domains' screens, log out, log in as B in the same tab, assert no A data appears and no request carries A's identifiers (`testing-scenarios.md`).

## Step-up authentication and MFA in the UI

- **Step-up** means re-authenticating for a sensitive action (export, payment, changing credentials) even with a valid session. The API signals it (for example `403` with a code such as `step_up_required` or an `acr` requirement); the UI opens a re-authentication dialog, keeps the pending action, and replays it once the server confirms the higher assurance.
- The **assurance level and its expiry are server state**. The client may show a countdown from a value the server returned, never decide locally that assurance is still valid.
- **MFA enrolment** is a guided flow with recovery codes shown once, confirmation of a first code, and a clear exit; do not block the whole app behind enrolment unless policy requires it.
- **Passkeys/WebAuthn** need the exact relying-party origin; test on the real domain, not only `localhost`.
- Do not store "mfaVerified" in `localStorage` or a plain cookie as authority; it is a hint at most.

## Authorization in the client is UX

| The client does | The server does |
|---|---|
| Hides navigation and actions the user cannot use | Rejects every request the user cannot perform, per resource |
| Guards routes to avoid showing empty or forbidden screens | Decides what the user can see and returns only that |
| Adapts forms (read-only fields, disabled buttons) | Validates every field and every transition |
| Reacts to `403` and `404` gracefully | Logs and audits the decision |

Implementation rules:
- **One permission source**, provided by the server with the session: a matrix such as `{ modules: ['orders', 'billing'], permissions: ['orders.read', 'orders.approve'] }`. Expose `can('orders.approve')` and `canSee('billing')` from one composable or hook; components never read roles.
- **Per-resource flags travel with the entity** (`canEdit`, `canDelete`, `puedo_aprobar`). The list endpoint computes them; the UI renders buttons from them. This is how row-level rules reach the screen without duplicating the policy.
- **Menus, breadcrumbs and route guards derive from one catalog** of screens with their required module and action. Three hand-written lists drift; one table does not.
- **No literal roles in UI code** (`role === 'admin'`). Roles change, permissions are the stable contract. `routes-audit.mjs` lists literal role checks (`hardcoded-role-check`).
- **Guards are cheap**: check the matrix already in memory; do not call the API from a guard. If the matrix is missing (fresh load), load it once in a plugin or root layout before rendering protected routes.
- **Refresh the matrix** on focus after a long idle, after a 403, and when the server pushes a "permissions changed" event; permissions cached forever are the second most common cause of "I can see it but it fails".

## Permission revoked mid-session

When an administrator removes a permission, the user keeps the old matrix until it is refreshed and the API starts answering `403`. Dozens of requests may fail at once (a dashboard). The reaction must run once per burst, invalidate what the user may no longer see, explain, and move the user to a safe place.

```ts
// @verify vue:lib/auth/forbidden-handler.ts
/**
 * Permission revoked mid-session: when the API starts answering 403 for data the user could see,
 * invalidate client caches, tell the user and navigate away. Many requests fail at the same time,
 * so the reaction must run once per burst.
 */
export interface ForbiddenDeps {
  invalidateAll: () => void
  notify: (message: string) => void
  redirect: (to: string) => void
}

export interface AppErrorLike {
  kind: string
  status?: number
}

export function createForbiddenHandler(deps: ForbiddenDeps, { noAccessPath = '/no-access' } = {}) {
  let handling = false
  return function handle(error: AppErrorLike, currentPath: string): boolean {
    if (error.kind !== 'forbidden') return false
    if (handling) return true
    handling = true
    deps.invalidateAll()
    deps.notify('Your permissions changed. Reloading what you can access.')
    deps.redirect(`${noAccessPath}?from=${encodeURIComponent(currentPath)}`)
    queueMicrotask(() => {
      handling = false
    })
    return true
  }
}
```

Wire it in the HTTP error path (the `forbidden` kind from `api-clients.md`), with `invalidateAll` refetching the permission matrix and clearing the affected queries. A `403` on a single optional widget (a card the user never had) should be handled locally as an empty state instead; the global handler is for data the user was already seeing.

## Multi-tenancy in the frontend

Resolution of the active tenant:

| Source | Example | Authority? | Notes |
|---|---|---|---|
| Subdomain | `acme.app.example.com` | For branding and API host only | One origin per tenant isolates cookies and storage for free; needs wildcard certificate and CDN rules (`deployment.md`) |
| Path prefix | `/t/acme/...` | No | One origin for all tenants: every key must carry the tenant; links must keep the prefix |
| Session claim or header | `tenant_id` in the token or `X-Tenant` set by the backend | **Yes** | The API verifies it; the client only mirrors it |
| User choice (switcher) | organization switcher for multi-org users | No; the server records the choice | Switching is a logout-like event for client state |

Rules:
- The tenant that **authorizes** is the one in the session or token, checked by the API on every request. The frontend never sends a tenant id it chose as proof of anything; it may send it as a hint the server validates.
- **Every cache key and storage key carries the tenant.** Query keys: `['tenant', tenantId, ...]`; storage keys: `app:<tenant>:<user>:<name>`. The compiled helpers below are the pattern; use them from the query key factory and the persistence layer so no caller can forget.
- **Switching tenant clears state instead of hiding it**: query cache, stores, module-level caches, open sockets, persisted drafts of the previous tenant. "Hidden" state resurfaces when the user switches back or when a key is reused.
- **Branding per tenant** comes from one public endpoint for the active tenant (`/public/branding?tenant=acme`); the bundle and the SSR payload never contain the full tenant catalog.
- **SSR**: resolve the tenant per request from the host or the session in a plugin or middleware; never in module scope. A module-level `currentTenant` is a cross-request leak (`state-audit.mjs`, `module-level-mutable-state`).
- **`ssr: false`** removes the cross-request risk but not the in-tab risk: logout → login as another organization in the same tab must still clear everything.
- **One origin per tenant** gives storage isolation, simpler CSP and no key scoping bugs; it costs certificates, CDN behaviors and a login redirect per origin. One shared origin needs the scoping rules above enforced by code review and tests.

```ts
// @verify vue:lib/tenant/scoped-state.ts
/**
 * Tenant scoping for client state. Every cache key and storage key carries the tenant, and
 * switching tenant clears everything instead of hiding it, so a later switch back cannot
 * resurrect another organization's data.
 */
export function tenantKey(tenant: string, key: readonly unknown[]): readonly unknown[] {
  return ['tenant', tenant, ...key]
}

export function storageKey(tenant: string, userId: string, name: string): string {
  return `app:${tenant}:${userId}:${name}`
}

export class TenantScopedState {
  private tenant: string | null = null
  private readonly entries = new Map<string, unknown>()
  private readonly listeners = new Set<(tenant: string | null) => void>()

  get current(): string | null {
    return this.tenant
  }

  switchTo(tenant: string | null): void {
    if (tenant === this.tenant) return
    this.entries.clear()
    this.tenant = tenant
    for (const listener of this.listeners) listener(tenant)
  }

  set(key: string, value: unknown): void {
    if (!this.tenant) throw new Error('No active tenant')
    this.entries.set(`${this.tenant}:${key}`, value)
  }

  get<T>(key: string): T | undefined {
    return this.tenant ? (this.entries.get(`${this.tenant}:${key}`) as T | undefined) : undefined
  }

  get size(): number {
    return this.entries.size
  }

  /** Query caches, stores and sockets register here to drop their data on switch. */
  onSwitch(listener: (tenant: string | null) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
```

Cross-tenant leak checklist (review and test):
- [ ] No query key, `useState` key or storage key without the tenant (or one origin per tenant)
- [ ] Switch and logout clear caches, stores, module-level maps, sockets and persisted tenant data
- [ ] No tenant catalog or other tenants' configuration in the bundle or the SSR payload
- [ ] SSR resolves the tenant per request; no module-level tenant or client instance
- [ ] Telemetry tags events with the tenant but never with other tenants' identifiers
- [ ] Two browser contexts logged into two tenants never receive each other's data (`testing-scenarios.md`)

## Sensitive data (PHI, PII, financial)

- **Never persist** health, financial or identity records in `localStorage`, `sessionStorage` or IndexedDB; the query cache in memory is the only client copy, and it is cleared on logout and tenant switch. Drafts that contain sensitive fields are kept in memory or on the server, not on disk.
- **Private responses are not cacheable**: `Cache-Control: private, no-store` on authenticated HTML and API responses (Nuxt `routeRules` headers for `/app/**`; Next.js `headers()` or per-route config). Note that `no-store` on the document disables the back/forward cache in some browsers; that is the intended trade for clinical screens.
- **Telemetry and logs** never contain record contents, names or identifiers in URLs when avoidable (`/patients/:id` is acceptable in traces only if the id is opaque and the tool masks it; names in query strings are not). See `observability.md`.
- **Screens**: idle lock, masking of identifiers in lists (`****1234`), explicit "show" actions for secrets, a print stylesheet that strips what must not be printed, and no sensitive data in the document title (it lands in browser history and window switchers).
- **Exports and uploads** go through signed, short-lived URLs issued by the server for the specific resource (`security.md`, uploads section).

## Nuxt and Next.js specifics

**Nuxt**
- Session user object in `useState('session')` or a small store, hydrated once per request from the cookie session; never from module scope.
- During SSR, forward the cookie to the API (`useRequestHeaders(['cookie'])`, the pattern in `nuxt.md` and `axios.md`); with `nuxt-auth-utils`, the Nitro side reads the sealed session and calls the API with the stored token.
- Route middleware checks the in-memory matrix; `server/middleware` and Nitro routes enforce with `requireUserSession` or by forwarding to the API.
- `clearNuxtState()` on logout; `routeRules` to mark the private area `ssr: false` and `no-store` when the product does not need SSR there.

**Next.js**
- Read the session in Server Components, Server Functions and Route Handlers (`cookies()`), on every entry; `proxy.ts` only redirects anonymous users early.
- Server Functions are public endpoints: session plus per-resource authorization inside each one (`nextjs.md`); `routes-audit.mjs` reports actions without a visible check.
- Client Components receive the permission matrix as props or through a provider created per request; never a module-level store with per-user data (`state-react.md`).
- `import 'server-only'` on modules that hold tokens or secrets so a client import fails the build.

## Anti-patterns and migration from tokens in `localStorage`

Anti-patterns: tokens in `localStorage` or non-`HttpOnly` cookies; `Authorization` header mutated on a shared instance; role strings in templates; guards that call the API; permissions cached forever; tenant taken from the URL as authority; one `logout()` that only redirects; refresh logic duplicated per app behind one domain.

Migration path when an app stores tokens in `localStorage` today (common in `ssr: false` panels):
1. **Measure the blast radius**: CSP present? Any `v-html`? Third-party scripts? (`security.md`). Until the migration lands, these controls limit the damage of an XSS.
2. **Move the session to the server**: the API or a BFF route sets the `HttpOnly` cookie at login; the refresh endpoint rotates it. Keep the API accepting both for one release.
3. **Switch the HTTP client** to `withCredentials`/same-origin cookies and remove the interceptor that reads storage; keep the single-flight 401 retry.
4. **Delete the stored tokens on first load** of the new version and broadcast a logout to other tabs.
5. **Add the tests**: no token in storage after login, concurrent 401s trigger one refresh, logout clears caches (`testing-scenarios.md`).
6. **Remove the compatibility path** in the API and record the change in an ADR.
