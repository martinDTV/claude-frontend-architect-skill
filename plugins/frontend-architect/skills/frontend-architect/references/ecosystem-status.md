# Ecosystem status

Snapshot verified against the npm registry on **2026-10-16**. Always re-check the installed version (`node_modules/<pkg>/package.json`) and npm before relying on this table; it ages quickly.

| Package | Latest | Status and notes |
|---|---|---|
| nuxt | 4.6.2 | `app/` source dir; Nuxt 3 projects may use compatibility mode |
| vue | 3.5.44 | |
| next | 16.4.2 | `proxy.ts` replaces `middleware.ts` (deprecated); Cache Components and `"use cache"`; `next lint` removed |
| react | 19.3.1 | |
| pinia | 4.1.0 | v4: ESM only; install `@vue/devtools-api` alongside; store API unchanged |
| @pinia/nuxt | 1.0.3 | peer `pinia ^4.1.0` |
| @pinia/colada | 1.4.8 | peer `pinia ^2.2.6 \|\| ^3 \|\| ^4.0.2` |
| @pinia/colada-nuxt | 1.2.0 | |
| @pinia/testing | 2.0.2 | peer `pinia >=4.1.0` |
| pinia-plugin-persistedstate | 4.7.1 | last publish 2025-11; peer `pinia >=3` |
| pinia-orm | 2.0.0 | Node >= 22.12 |
| @nuxt/ui | 4.12.0 | Reka UI + Tailwind |
| @vueuse/core | 15.0.0 | |
| axios | 1.20.0 | |
| ofetch | 1.5.1 | |
| @tanstack/vue-query, @tanstack/react-query | 5.104.3 | |
| zustand | 5.0.15 | |
| @reduxjs/toolkit | 2.13.0 | |
| jotai | 3.0.1 | |
| recoil | 0.7.7 | **Unmaintained** (last publish 2024-02) |
| zod | 4.6.7 | v4 APIs (`z.email()`, `z.flattenError`) |
| valibot | 1.5.0 | |
| gsap | 3.15.0 | "Standard no-charge license", not OSI; read gsap.com/standard-license |
| three | 0.186.1 | |
| @tresjs/core / @tresjs/nuxt | 5.9.3 / 5.7.3 | |
| @react-three/fiber | 9.8.2 | peer `react >=19 <19.4` |
| lenis | 1.3.27 | `@studio-freight/lenis` is **deprecated** |
| motion | 14.3.0 | |
| @module-federation/nextjs-mf | 8.8.76 | **Next ≤ 15 only, Pages Router only, end of life announced** |
| @module-federation/vite | 1.23.5 | maintained |
| radix-vue | 1.9.17 | **Renamed to reka-ui** (2.11.0) |
| madge | 8.0.0 | last publish 2024-08 |
| vitest | 5.0.5 | |
| @playwright/test | 1.64.1 | |

Installation note (verified): `npm` 10.9 failed to resolve a Nuxt 4.6 + Pinia 4 + Pinia Colada dependency tree with an internal arborist error (`reading 'edgesOut'`); `pnpm` 10 installed it cleanly. Recommend pnpm for Nuxt projects.
