# Frontend security

## Contents
- Principles
- XSS
- CSRF and cookies
- Content Security Policy
- Secrets and configuration
- SSR-specific risks
- Authentication and authorization in the frontend
- Supply chain
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

## Secrets and configuration

- No API secrets, private keys or service credentials in client code, ever. Call third-party APIs that need secrets from the server (Nitro routes, Route Handlers, Server Functions).
- Disable or protect production source maps if they expose internal code you consider sensitive.
- Separate public and private config by construction (`runtimeConfig` vs `runtimeConfig.public`; server-only env vars vs `NEXT_PUBLIC_*`), and add `server-only` imports to modules that read secrets.

## SSR-specific risks

- **Cross-request state leaks**: module-level variables, singletons with user data, shared stores or HTTP clients with per-user headers on the server. Create per request (Nuxt plugins, per-request providers).
- **Serialized state**: everything in Nuxt payloads or React Server Component props reaches the HTML. Do not pass full user records, tokens or internal fields to the client.
- **SSRF**: server code fetching user-provided URLs must allowlist hosts.
- Forward only the headers you need (`cookie`) to the backend; never echo arbitrary headers.

## Authentication and authorization in the frontend

- Prefer `HttpOnly` cookie sessions over tokens in JavaScript-accessible storage.
- If tokens must live in the browser (third-party SDK), keep them in memory, short-lived, refreshed via an `HttpOnly` refresh cookie, and document the decision in an ADR.
- Hide UI the user cannot use, but always expect the API to return 403 and handle it.
- Log out everywhere: clear client caches (query cache, stores, persisted state) on logout and broadcast to other tabs.

## Supply chain

- Commit the lockfile; install with `npm ci` / `pnpm install --frozen-lockfile` in CI.
- Automated updates (Renovate or Dependabot) and audits (`npm audit`, `pnpm audit`, or the platform scanner) in CI.
- Review new dependencies: maintenance, downloads, install scripts, maintainers. Prefer fewer dependencies.
- Pin third-party scripts and load them with Subresource Integrity when served from a CDN.
- Agent skills and plugins are code too: review scripts before installing them (see `docs/research.md`).

## Review checklist

- [ ] No `v-html`/`dangerouslySetInnerHTML` with unsanitized input
- [ ] No secrets in client bundles or public config
- [ ] Session cookies `HttpOnly`, `Secure`, `SameSite`
- [ ] CSP present (at least report-only)
- [ ] No module-level per-user state in SSR code
- [ ] Server Functions, Route Handlers and Nitro routes validate input and check authorization
- [ ] Logout clears all client caches
- [ ] Dependencies audited in CI
