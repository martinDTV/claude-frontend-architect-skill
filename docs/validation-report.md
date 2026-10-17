# Validation report

Date: 2026-10-17. Environment: Ubuntu 24.04, Node 22.22, npm 10.9, pnpm 10.34, Claude Code CLI 2.1.301.
Command: `./verification/run-all.sh` (exit 0, 62 s) plus the checks listed separately below.

## Versions under test (installed, not assumed)

nuxt 4.6.2 · vue 3.5.44 · pinia 4.1.0 · @pinia/colada 1.4.8 · @pinia/colada-nuxt 1.2.0 · pinia-plugin-persistedstate 4.7.1 · next 16.4.2 · react 19.3.x · @tanstack/react-query 5.104 · zustand 5.0.15 · axios 1.20.0 · zod 4.6 · three 0.186.1 · @tresjs/core 5.9.3 · @react-three/fiber 9.8.2 · gsap 3.15.0 · lenis 1.3.27 · typescript 5.9 · vitest 5.0.5 · dependency-cruiser 18.6 · nginx 1.24.

## Results

| # | Check | Result |
|---|---|---|
| 1 | 58 code blocks extracted from the references into 5 projects | OK |
| 2 | Vue project: `tsc` strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`) | Pass |
| 3 | Vitest: Problem Details → `ApiError`; single-flight refresh on concurrent 401s; no refresh loop; contract validation; cart store; persisted-state `pick` + versioned key | 6/6 pass |
| 4 | React project: `tsc` strict (HTTP provider, TanStack Query hooks and provider, Zustand persist with migration, R3F components) | Pass |
| 5 | Next.js 16.4: `tsc` and `next build` (Server Function with `useActionState` and `updateTag`, HMAC webhook Route Handler, `proxy.ts` recognized as Proxy) | Pass |
| 6 | Nuxt 4.6: `nuxt typecheck` (Axios and `$fetch` plugins, `useApiFetch`, Pinia Colada composables, generic `UiSelect` with `defineModel`/`defineSlots`, `UserList.vue`, TresJS 5 components) | Pass |
| 7 | Nuxt typecheck negative test: injected type errors in `.ts` and `.vue` are reported; `useNuxtApp().$api` is typed as `AxiosInstance` | Detected as expected |
| 8 | Creative project: `tsc` strict (GSAP context + matchMedia, Vue composable, `@gsap/react` component, Lenis + ScrollTrigger, Three.js scene and disposal, ShaderMaterial) | Pass |
| 9 | SSR runtime: production Nuxt build + mock backend; 40 concurrent requests from 20 sessions | Documented pattern: **40/40 correct, 0 leaks**; HTML server-rendered with data |
| 10 | SSR negative control: module-level Axios instance with mutable per-request header and an async plugin step | **38/40 responses contained another user's data**: the anti-pattern the skill forbids is a real leak |
| 11 | Same correct pattern with the same async step | 40/40 correct, 0 leaks |
| 12 | dependency-cruiser rules from `folder-structure.md` on a fixture | Both intentional violations reported; public `index.ts` and intra-feature imports allowed |
| 13 | Nginx reverse-proxy example from `microfrontends.md` | `nginx -t` passes |
| 14 | `claude plugin validate` (marketplace and plugin) | Pass |
| 15 | Local install via marketplace; `claude plugin details` | 2 skills + 1 agent discovered; always-on cost ~437 tokens; core skill ~2.4k tokens on invoke |
| 16 | `claude plugin eval` | Suite discovered and graders parsed; **runs not executed** (no authenticated account in this environment) |

## Defects found by verification during development

- An invented Three.js API (`renderer.getAnimationLoop`) in `threejs.md`: caught by `tsc`, fixed.
- An undeclared dependency (`@vueuse/core`) in the TresJS example: caught by `nuxt typecheck`, now documented.
- First negative control produced 0 leaks because there was no async gap between plugin and request; documented that leaks require interleaving (common in real apps with async plugins or middleware) and re-ran with a realistic async step.
- npm 10.9 cannot resolve the Nuxt 4.6 + Pinia 4 tree (`reading 'edgesOut'`); pnpm works. Documented in `ecosystem-status.md` and the README.

## Not verified (honest limits)

- **Eval scores**: need `claude plugin eval` with an authenticated account. Expected cost: 20 cases × 3 runs × 2 arms by default.
- Rendering of TresJS and R3F scenes in a browser (compiled and typed, not rendered); GLSL compiled by TypeScript only as strings, not by a GPU driver.
- Browser behavior of GSAP, Lenis and View Transitions (typed only).
- Prose guidance (accessibility, security, performance, design) is reviewed, not executable.
- Install from GitHub (`/plugin marketplace add martinDTV/claude-frontend-architect-skill`): verified from a local path; repeat after publishing.
