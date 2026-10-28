# Frontend security

## Contents
- Principles
- XSS
- CSRF and cookies
- Content Security Policy
- Clickjacking
- Secrets and configuration
- SSR-specific risks
- SSR and hybrid rendering: more vulnerabilities
- Authentication and authorization in the frontend
- OAuth, OIDC and BFF
- File uploads
- Sanitization table
- Supply chain
- Dependency hygiene
- Multi-tenancy, sensitive data and tests
- Severity ladder
- Review checklist

## Principles

- The browser is untrusted. Every check in the frontend is UX; the backend enforces.
- Anything shipped to the client is public: bundles, `runtimeConfig.public`, `NEXT_PUBLIC_*`, source maps.
- Validate data at every boundary: API responses, URL params, storage, `postMessage`, third-party scripts.

## XSS

- Templates escape by default; the dangerous APIs are `v-html`, `innerHTML`, `dangerouslySetInnerHTML`, `eval`, `new Function`, and `href`/`src` built from user input.
- If HTML from users or a CMS must render, sanitize with DOMPurify (configured allowlist) on the client, or sanitize server-side; prefer Markdown rendered with a safe renderer.
- Reject `javascript:` and `data:` URLs in user-provided links; allowlist protocols (`https:`, `mailto:`).
- Never interpolate user input into inline `<script>` or JSON in HTML without the framework's safe serialization.

## CSRF and cookies

- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict`), narrow `Path` and no `Domain` unless subdomains must share it.
- `SameSite=Lax` blocks most cross-site POSTs; for cookie-authenticated APIs also require a CSRF token or a custom header checked by the backend, and verify `Origin`.
- Next.js Server Functions check that the `Origin` matches the host; keep `serverActions.allowedOrigins` narrow if configured.
- CORS is enforced by the backend; the frontend cannot "fix" CORS. Never configure `*` with credentials.

## Content Security Policy

- Set a CSP header (at the edge, proxy, `routeRules` headers in Nuxt, or `proxy.ts`/`next.config` headers in Next.js). Start with `default-src 'self'`, add exact origins for APIs, fonts, images and analytics.
- Avoid `'unsafe-inline'` and `'unsafe-eval'` for scripts; use nonces (Next.js supports nonce-based CSP through `proxy.ts`; Nuxt via a security module such as `nuxt-security`).
- Add `frame-ancestors` (clickjacking), `base-uri 'self'`, `object-src 'none'`.
- Roll out with `Content-Security-Policy-Report-Only` first.

## Clickjacking

- Send `Content-Security-Policy: frame-ancestors 'none'` (or the exact origins allowed to embed) on every HTML response; keep `X-Frame-Options: DENY` for old clients. `frame-ancestors` wins when both are present.
- Widgets meant to be embedded get their own route with an explicit `frame-ancestors` allowlist and no session-bound actions, or `postMessage` with origin checks.
- Nuxt: `routeRules` headers or `nuxt-security`; Next.js: `headers()` in `next.config` or `proxy.ts`; at the edge when a CDN fronts several apps (`deployment.md`).

## Secrets and configuration

- No API secrets, private keys or service credentials in client code, ever. Call third-party APIs that need secrets from the server (Nitro routes, Route Handlers, Server Functions).
- Disable or protect production source maps if they expose internal code you consider sensitive.
- Separate public and private config by construction (`runtimeConfig` vs `runtimeConfig.public`; server-only env vars vs `NEXT_PUBLIC_*`), and add `server-only` imports to modules that read secrets.

## SSR-specific risks

- **Cross-request state leaks**: module-level variables, singletons with user data, shared stores or HTTP clients with per-user headers on the server. Create per request (Nuxt plugins, per-request providers).
- **Serialized state**: everything in Nuxt payloads or React Server Component props reaches the HTML. Do not pass full user records, tokens or internal fields to the client.
- **SSRF**: server code fetching user-provided URLs must allowlist hosts.
- Forward only the headers you need (`cookie`) to the backend; never echo arbitrary headers.

## SSR and hybrid rendering: more vulnerabilities

| Risk | How it happens | Prevention |
|---|---|---|
| **SSRF** | Server code fetches a URL that came from the user (image proxy, link preview, "import from URL") | Allowlist hosts and schemes on the server; resolve and block private ranges; never pass user URLs to `fetch`/`$fetch` on the server unchecked |
| **Header injection and reflection** | Forwarding arbitrary request headers upstream, or echoing headers into the response | Forward only the headers you need (`cookie`, `accept-language`, trace ids); never echo user-controlled values into `Set-Cookie`, `Location` or logs |
| **Cache poisoning of personalized pages** | A personalized SSR response cached by the CDN or `routeRules` `swr`/`isr` and served to others | `Cache-Control: private, no-store` for anything that depends on the session; cache keys that include what varies; never cache per-user data in `"use cache"`/ISR (`nextjs.md`, `deployment.md`) |
| **Open redirect in `returnTo`/`next`** | Login or callback redirects to a URL from the query string | Accept only relative paths starting with a single `/`, or an allowlist; validate on the server too (`auth-session-tenant.md`) |
| **Prototype pollution through query and body parsing** | Objects built from `?__proto__[x]=y` or nested bracket syntax reaching `Object.assign` or a merge | Validate query and body with a schema (Zod/Valibot) before use; prefer `Object.create(null)` maps; do not deep-merge user input into config |
| **Server-only code in the client bundle** | A module with secrets imported from a Client Component or a shared composable | `import 'server-only'` (Next) and keeping secrets in `server/` or private `runtimeConfig` (Nuxt); `state-audit.mjs` and the bundle analyzer catch the obvious cases |
| **Payload over-exposure** | Full user records, roles, feature flags for other tenants or internal fields serialized into the HTML payload | Select fields before returning from loaders; `pick`/`transform` in `useAsyncData`; props to Client Components are public |
| **Streaming and partial rendering** | Errors thrown while streaming leak stack traces into the HTML, or a deferred part renders without authorization because the check happened only in the shell | Error boundaries per segment that render safe messages; authorization inside the deferred loader, not only in the layout |
| **Timing and enumeration through server routes** | BFF routes that answer differently for existing and non-existing resources | Same status and timing for "not yours" and "does not exist" (404 for both) |

## Authentication and authorization in the frontend

- Prefer `HttpOnly` cookie sessions over tokens in JavaScript-accessible storage.
- If tokens must live in the browser (third-party SDK), keep them in memory, short-lived, refreshed via an `HttpOnly` refresh cookie, and document the decision in an ADR.
- Hide UI the user cannot use, but always expect the API to return 403 and handle it.
- Log out everywhere: clear client caches (query cache, stores, persisted state) on logout and broadcast to other tabs.

## OAuth, OIDC and BFF

Authorization Code with PKCE is the only browser flow; exchange the code on the server (backend session or BFF) so tokens never reach JavaScript; validate `state` and `nonce`; keep callbacks thin and `returnTo` relative. Session models, refresh, logout protocol, step-up and multi-tenancy are developed in `auth-session-tenant.md`; this reference keeps the threats and headers.

## File uploads

- The browser uploads directly to object storage with a **signed URL issued by the server for that specific user, resource, content type and size**, short-lived; the API records the upload only after the storage confirms it (or verifies the object).
- The client's `type` and `size` are hints. The server verifies magic bytes, re-encodes images (which also strips metadata and most embedded payloads), rejects SVG unless sanitized and served with `Content-Disposition: attachment` or from a separate origin, and scans with antivirus where the product requires it.
- Never serve user uploads from the application origin with `inline` disposition: HTML or SVG uploads become stored XSS. Use a separate domain or a CDN with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- Filenames are display data: generate the storage key; sanitize the display name; never build paths from it.
- Signed URLs that include the content type fail when the client sends another one: set `Content-Type` consistently in the upload call (an easy-to-miss bug across upload helpers).
- Limits on the client (size, count, extension) are usability; the same limits exist on the server.

## Sanitization table

| Input | Where it is used | How |
|---|---|---|
| HTML from users or a CMS | `v-html`, `dangerouslySetInnerHTML` | DOMPurify 3.4.x in the browser (`isomorphic-dompurify` 4.6.x on the server) with an explicit allowlist of tags and attributes; forbid `style` and event attributes; prefer Markdown rendered by a safe renderer |
| Markdown | Rendered to HTML | A renderer with HTML disabled or sanitized output; links through the URL rule below |
| URLs from users | `href`, `src`, redirects, `window.open` | Parse with `new URL(value, base)`; allow only `https:` (and `mailto:`/`tel:` where needed); reject `javascript:`, `data:`, `vbscript:`; relative-only for redirects |
| Filenames | Display, download names | Strip path separators and control characters; cap length; never a storage path |
| SVG uploads or inline SVG from users | Images, icons | Rasterize server-side, or sanitize with an SVG-aware profile and serve as an attachment from another origin |
| Rich text editors (TipTap, ProseMirror, Quill) | Stored documents | Schema-constrained documents; sanitize on render anyway; validate on the server |
| Query strings and route params | Filters, ids | Schema validation; ids as opaque strings; numbers parsed and bounded |
| `postMessage` | Embedded widgets, auth popups | Check `event.origin` against an allowlist and validate the message shape |
| JSON inlined into HTML | SSR payloads, inline scripts | The framework's serializer only; never string concatenation |

## Supply chain

- Commit the lockfile; install with `npm ci` / `pnpm install --frozen-lockfile` in CI.
- Automated updates (Renovate or Dependabot) and audits (`npm audit`, `pnpm audit`, or the platform scanner) in CI.
- Review new dependencies: maintenance, downloads, install scripts, maintainers. Prefer fewer dependencies.
- Pin third-party scripts and load them with Subresource Integrity when served from a CDN.
- Agent skills and plugins are code too: review scripts before installing them (see `docs/research.md`).

## Dependency hygiene

- Lockfile committed and respected in CI (`npm ci`, `pnpm install --frozen-lockfile`); the package manager pinned with `packageManager`.
- `npm audit`/`pnpm audit` catches known advisories only; a clean audit is not a safe tree. Add provenance checks where the registry supports them and review new dependencies by hand: maintainers, downloads, install scripts (`preinstall`/`postinstall`), size, transitive count.
- Renovate or Dependabot with grouping (framework, test tooling, types) and a schedule the team actually reviews; security updates separately and fast.
- Pin GitHub Actions to commit SHAs; restrict `GITHUB_TOKEN` permissions; no secrets in forks' workflows.
- Prefer fewer dependencies: a utility you can write in twenty lines is not worth a maintainer you do not know.
- Agent skills, editor plugins and CLI tools are code with repository access: read their scripts before installing (`docs/research.md` in this repository records what was reviewed).

## Multi-tenancy, sensitive data and tests

Tenant isolation in client state (keys, switch, logout) and sensitive data handling (PHI/PII never persisted, `no-store`, telemetry scrubbing) are in `auth-session-tenant.md`. Security tests that belong in CI (CSP report-only in E2E, XSS payloads through the real sanitizer, no token in storage, 403 handling, cross-tenant isolation with two browser contexts) are in `testing-scenarios.md`.

## Severity ladder

| Severity | Frontend examples |
|---|---|
| **Critical** | Secret or private key in a client bundle; module-level per-user state or client in SSR code (cross-request leak); unsanitized HTML from untrusted users; Server Function or Nitro route that mutates data without authorization |
| **High** | Tokens in `localStorage` or JS-readable cookies; missing CSRF protection on cookie-authenticated mutations; open redirect in auth flows; uploads served inline from the app origin; personalized pages cached publicly; no CSP at all on an app with third-party scripts |
| **Medium** | CSP with `'unsafe-inline'` for scripts; missing `frame-ancestors`; logout that leaves caches; permissions cached forever; literal role checks; source maps public by accident; unpinned third-party scripts without SRI |
| **Low** | Missing `Referrer-Policy`/`Permissions-Policy`; verbose error messages; outdated but unexploited dependencies; console noise revealing internals |

A finding's severity also depends on exposure (public internet versus intranet), data class (PHI, payments) and compensating controls; state them when you rate.

## Review checklist

- [ ] No `v-html`/`dangerouslySetInnerHTML` with unsanitized input
- [ ] No secrets in client bundles or public config
- [ ] Session cookies `HttpOnly`, `Secure`, `SameSite`
- [ ] CSP present (at least report-only)
- [ ] No module-level per-user state in SSR code
- [ ] Server Functions, Route Handlers and Nitro routes validate input and check authorization
- [ ] Logout clears all client caches
- [ ] Dependencies audited in CI
- [ ] `frame-ancestors` set; uploads signed, verified server-side and served as attachments from a separate origin
- [ ] `returnTo`/`next` accepts relative paths only; no user URLs fetched by the server without an allowlist
- [ ] Personalized responses `private, no-store`; no tenant catalog or other users' data in payloads
- [ ] Security scenarios from `testing-scenarios.md` in the pipeline
