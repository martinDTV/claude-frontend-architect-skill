# Ecosystem status

Snapshot verified against the npm registry on **2026-10-28** (`npm view <pkg> version time.modified peerDependencies`). Always re-check the installed version (`node_modules/<pkg>/package.json`) and npm before relying on this table; it ages quickly. "Last publish" is the registry's `time.modified` date.

## Contents
- Frameworks and language
- Vue and Nuxt state, data and UI
- React and Next.js state, data and UI
- HTTP, validation, forms, tables, charts, i18n
- Observability, security and auth
- Testing and quality tooling
- Motion and 3D
- Microfrontends and monorepos
- Deprecated, unmaintained or renamed
- Installation and compatibility notes

## Frameworks and language

| Package | Latest | Last publish | Status and notes |
|---|---|---|---|
| nuxt | 4.6.3 | 2026-10-27 | `app/` source dir; Nuxt 3 projects may use `future.compatibilityVersion: 4`; Nuxt 4.5+ builds on Vite 8 / Rolldown (check plugins that pin a Vite version) |
| vue | 3.5.44 | 2026-10-23 | |
| next | 16.4.3 | 2026-10-27 | `proxy.ts` replaces `middleware.ts` (deprecated); Cache Components and `"use cache"`; `next lint` removed |
| react | 19.3.1 | 2026-10-27 | |
| typescript | 7.0.2 | 2026-10-28 | **New major.** Check that `vue-tsc`, Nuxt, Next.js, ESLint typescript tooling and your editor declare support before upgrading a project; stay on 5.9.x until they do |
| vue-tsc | 3.3.13 | 2026-10-10 | peer `typescript >= 5.0.0`; used by `nuxt typecheck` |
| @vue/compat | 3.5.44 | 2026-10-23 | Migration build for Vue 2 → 3; same version line as `vue` |
| astro | 7.4.4 | 2026-10-28 | Reference islands framework; mentioned for content sites, not as a migration target for apps |

## Vue and Nuxt state, data and UI

| Package | Latest | Last publish | Status and notes |
|---|---|---|---|
| pinia | 4.1.0 | 2026-10-14 | v4: ESM only; peer `vue ^3.5.11`, `typescript >= 5.6`, `@vue/devtools-api ^8.2.1` must be installed alongside; store API unchanged from v3 |
| @pinia/nuxt | 1.0.3 | 2026-10-14 | peer `pinia ^4.1.0` (projects on Pinia 3 keep `@pinia/nuxt` 0.11.x) |
| @pinia/colada | 1.4.8 | 2026-10-08 | peer `vue ^3.5.41`, `pinia ^2.2.6 \|\| ^3 \|\| ^4.0.2` |
| @pinia/colada-nuxt | 1.2.0 | 2026-09-16 | peer `@pinia/colada >= 1.4.5` |
| @pinia/testing | 2.0.2 | 2026-10-14 | peer `pinia >= 4.1.0` |
| pinia-plugin-persistedstate | 4.7.1 | 2025-11-01 | peer `pinia >= 3`; maintained but slow-moving, check its issues before adopting |
| pinia-orm | 2.0.0 | 2026-07-20 | peer `pinia >= 3`, `vue >= 3.4`; Node >= 22.12 for tooling; rarely needed |
| @vue/devtools-api | 8.2.1 | 2026-10-19 | Required peer of Pinia 4 |
| @vueuse/core | 15.0.0 | 2026-09-16 | peer `vue ^3.5` |
| @vueuse/nuxt | 15.0.0 | 2026-09-16 | peer `nuxt ^3 \|\| ^4 \|\| ^5` |
| @nuxt/ui | 4.12.0 | 2026-10-15 | Reka UI + Tailwind; one `<UApp>` and one theme per application; peers for form validators (`zod ^3.24 \|\| ^4`, `valibot ^1`, `yup`, `joi`) |
| reka-ui | 2.11.0 | 2026-10-05 | Successor of `radix-vue`; headless primitives used by Nuxt UI |
| @nuxt/image | 2.2.0 | 2026-10-19 | |
| @nuxt/fonts | 1.2.0 | 2026-10-25 | |
| @nuxt/eslint | 1.17.0 | 2026-10-24 | peer `eslint ^9 \|\| ^10` |
| @nuxtjs/sitemap | 9.1.0 | 2026-10-13 | peer `nuxt ^4.6 \|\| ^5`, `zod ^4.6.5` |
| @tanstack/vue-query | 5.105.0 | 2026-10-26 | Alternative to Pinia Colada when a team standardizes on TanStack |

## React and Next.js state, data and UI

| Package | Latest | Last publish | Status and notes |
|---|---|---|---|
| @tanstack/react-query | 5.105.0 | 2026-10-26 | peer `react ^18 \|\| ^19` |
| zustand | 5.0.16 | 2026-10-22 | peer `react >= 18`; optional `immer`, `use-sync-external-store` |
| @reduxjs/toolkit | 2.13.0 | 2026-09-29 | peer `react-redux ^7.2.1 \|\| ^8.1.3 \|\| ^9` |
| jotai | 3.0.1 | 2026-09-29 | v3 is current; check migration notes from v2 |
| nuqs | 2.10.2 | 2026-10-08 | Typed URL search-param state; peer `next >= 14.2` or React Router |

## HTTP, validation, forms, tables, charts, i18n

| Package | Latest | Last publish | Status and notes |
|---|---|---|---|
| axios | 1.21.0 | 2026-10-27 | |
| ofetch | 1.5.1 | 2025-11-01 | Bundled in Nuxt as `$fetch`; stable, infrequent releases |
| zod | 4.6.7 | 2026-10-12 | v4 APIs (`z.email()`, `z.flattenError`) |
| valibot | 1.5.0 | 2026-09-09 | peer `typescript >= 5` |
| vee-validate | 4.15.1 | 2026-03-04 | peer `vue ^3.4.26`; no release in seven months at snapshot time: check activity before adopting in a new project (Nuxt UI's `UForm` validates with schemas directly) |
| react-hook-form | 7.91.0 | 2026-10-24 | |
| @hookform/resolvers | 6.0.2 | 2026-10-28 | peer `zod ^3.25 \|\| ^4`, `valibot`, `yup`, `joi` |
| @tanstack/vue-table / react-table | 9.3.1 | 2026-10-12 | **v9 is a new major** (v8 is widely documented); check the migration guide; peer `vue >= 3.2` / `react >= 18` |
| @tanstack/vue-virtual / react-virtual | 3.13.49 / 3.14.23 | 2026-10-26 | |
| echarts | 6.1.0 | 2026-05-19 | Canvas/SVG, large datasets; `vue-echarts` 8.3.2 (2026-10-09, peer `echarts ^6`) |
| apexcharts | 8.5.0 | 2026-10-24 | `vue3-apexcharts` 1.11.3 (peer `apexcharts >= 5.10`) |
| chart.js | 4.6.1 | 2026-10-22 | `vue-chartjs` 5.3.4 (2026-07-07, peer `chart.js ^4.1.1`) |
| recharts | 3.10.1 | 2026-10-24 | React; v3 line |
| @unovis/vue | 1.7.1 | 2026-09-29 | Framework-agnostic core with Vue and React wrappers |
| d3 | 7.9.0 | 2025-05-17 | Stable; use for custom visualizations, not as a chart library |
| @nuxtjs/i18n | 10.6.0 | 2026-10-13 | Nuxt module over `vue-i18n` |
| vue-i18n | 11.4.16 | 2026-10-18 | |
| next-intl | 4.14.9 | 2026-10-02 | peer `next ^12–^16` |

## Observability, security and auth

| Package | Latest | Last publish | Status and notes |
|---|---|---|---|
| web-vitals | 6.2.3 | 2026-10-05 | Field metrics with attribution build |
| @sentry/nuxt | 11.10.0 | 2026-10-28 | peer `nuxt >= 3.7 \|\| 4.x \|\| 5.x` |
| @sentry/nextjs | 11.10.0 | 2026-10-28 | peer `next ^14 \|\| ^15 \|\| ^16` |
| @sentry/vue | 11.10.0 | 2026-10-28 | peer `vue 2.x \|\| 3.x`, `pinia 2–4` |
| dompurify | 3.4.17 | 2026-10-12 | Client-side HTML sanitization |
| isomorphic-dompurify | 4.6.0 | 2026-10-16 | Same API on the server (SSR) |
| nuxt-security | 2.7.0 | 2026-10-24 | Security headers and CSP for Nuxt |
| nuxt-auth-utils | 0.5.33 | 2026-10-27 | Sealed-cookie sessions and OAuth providers for Nuxt; pre-1.0, frequent releases |
| better-auth | 1.7.14 | 2026-10-27 | Framework-agnostic auth with Vue, Next.js and Nuxt integrations |
| @auth/core | 0.41.3 | 2026-07-20 | Auth.js core (v5 line); `next-auth` 4.24.15 (2026-07-20) is the legacy Next.js package |

## Testing and quality tooling

| Package | Latest | Last publish | Status and notes |
|---|---|---|---|
| vitest | 5.0.5 | 2026-10-19 | peer `vite ^6.4 \|\| ^7 \|\| ^8` |
| @vitest/browser | 5.0.5 | 2026-10-19 | Browser mode for component tests |
| @nuxt/test-utils | 4.3.4 | 2026-10-16 | peer `nuxt ^3.21 \|\| ^4 \|\| ^5`, `vitest ^4.0.2 \|\| ^5` |
| @testing-library/vue | 8.1.0 | 2026-08-07 | |
| @testing-library/react | 16.3.3 | 2026-08-27 | peer `react ^18 \|\| ^19` |
| @playwright/test | 1.64.1 | 2026-10-28 | |
| @axe-core/playwright | 4.14.0 | 2026-10-27 | |
| msw | 3.0.3 | 2026-10-10 | **v3**: peer `typescript >= 5.9`, `vite >= 6`; check the v2 → v3 migration |
| @lhci/cli | 0.15.1 | 2025-06-25 | Lighthouse CI; infrequent releases, still the standard budgets runner |
| dependency-cruiser | 18.7.0 | 2026-10-23 | |
| eslint-plugin-boundaries | 7.4.0 | 2026-10-27 | peer `eslint >= 6` |
| eslint-plugin-vuejs-accessibility | 2.6.3 | 2026-10-21 | |
| eslint-plugin-jsx-a11y | 6.10.2 | 2024-10-26 | Still the standard; slow release cadence |
| knip | 6.43.0 | 2026-10-24 | Unused files, exports and dependencies |

## Motion and 3D

| Package | Latest | Last publish | Status and notes |
|---|---|---|---|
| gsap | 3.15.0 | 2026-04-13 | "Standard no-charge license", not OSI; read gsap.com/standard-license |
| motion | 14.7.1 | 2026-10-27 | peer `react ^18 \|\| ^19` |
| lenis | 1.3.27 | 2026-10-15 | `@studio-freight/lenis` is **deprecated** |
| three | 0.186.1 | 2026-09-24 | No semver; read migration notes between releases |
| @tresjs/core / @tresjs/nuxt / @tresjs/cientos | 5.10.0 / 5.8.0 / 5.10.0 | 2026-10-22 | v5: `useLoop()`; cientos peer `@tresjs/core ^5.9.1` |
| @react-three/fiber | 9.8.2 | 2026-10-21 | peer `react >= 19 < 19.4`: check before upgrading React |
| @react-three/drei | 10.7.9 | 2026-09-25 | peer `react ^19`, `@react-three/fiber ^9` |

## Microfrontends and monorepos

| Package | Latest | Last publish | Status and notes |
|---|---|---|---|
| @module-federation/nuxt | 0.2.0 | 2026-10-06 | **Beta**; peer `nuxt >= 4.5.1`; see `microfrontends.md` |
| @module-federation/vite | 1.23.6 | 2026-10-27 | peer `vite ^5.1 \|\| ^6 \|\| ^7 \|\| ^8`; client-side federation in Vite SPAs |
| @module-federation/enhanced / runtime | 2.9.2 | 2026-10-28 | Core |
| @module-federation/nextjs-mf | 8.8.76 | 2026-10-28 | **Next ≤ 15 only, Pages Router only, end of life announced** |
| @originjs/vite-plugin-federation | 1.4.1 | 2025-04-12 (version; metadata touched 2026-01) | Many open issues, no declared Vite 7/8 support; not recommended for new work |
| single-spa | 6.0.3 | 2025-09-22 | No Nuxt integration |
| turbo | 2.11.10 | 2026-10-20 | |
| nx | 24.0.2 | 2026-10-26 | |

## Deprecated, unmaintained or renamed

| Package | Latest | Last publish | Status |
|---|---|---|---|
| recoil | 0.7.7 | 2024-02-12 | **Unmaintained**; migrate to Jotai |
| radix-vue | 1.9.17 | 2025-02-28 | **Renamed to reka-ui** (2.11.0) |
| @studio-freight/lenis | — | — | **Deprecated**; use `lenis` |
| madge | 8.0.0 | 2024-08-05 | Older; prefer dependency-cruiser |
| next-auth 4.x | 4.24.15 | 2026-07-20 | Legacy line; Auth.js v5 is `@auth/core` + framework packages |
| vee-validate | 4.15.1 | 2026-03-04 | Not deprecated, but quiet; verify activity before adopting |
| react-scripts (Create React App) | — | — | Deprecated by the React team; migrate to Vite or Next.js (`legacy-modernization.md`) |

## Installation and compatibility notes

- `npm` 10.9 failed to resolve a Nuxt 4.6 + Pinia 4 + Pinia Colada dependency tree with an internal arborist error (`reading 'edgesOut'`); `pnpm` 10 installed it cleanly. Recommend pnpm for Nuxt projects.
- Pinia 4 requires `@vue/devtools-api` as an explicit dependency; `@pinia/nuxt` 1.x requires Pinia 4.1+.
- `@module-federation/nuxt` requires Nuxt ≥ 4.5.1, which means Vite 8 / Rolldown; treat the Nuxt upgrade and the federation spike as separate decisions.
- `msw` 3 requires TypeScript ≥ 5.9 and Vite ≥ 6; projects on older toolchains stay on msw 2.
- `@react-three/fiber` 9 pins React to `>= 19 < 19.4`; a React minor upgrade can break it.
- TypeScript 7 is a new major: pin 5.9.x in frontends until Nuxt, Next.js, `vue-tsc` and the ESLint TypeScript stack declare support.
