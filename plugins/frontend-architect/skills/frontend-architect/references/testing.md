# Testing and quality tooling

## Contents
- Strategy
- Unit and component tests
- Integration and E2E
- SSR, hydration and state isolation tests
- Accessibility, visual and performance tests
- Lint and architecture tooling
- CI pipeline

## Strategy

| Layer | Tool | What to test |
|---|---|---|
| Pure logic (domain, utils, schemas) | Vitest | Rules, edge cases, parsing |
| Services | Vitest + Axios adapter or MSW | Request shape, response validation, error normalization (`axios.md`) |
| Stores | Vitest + Pinia/Zustand | Actions and derived values |
| Composables / hooks | Vitest + test app or `renderHook` | State transitions with mocked services |
| Components | Vitest + Testing Library (Vue or React) | Behavior through the UI: roles, labels, user events |
| Pages, flows | Playwright | Critical journeys end to end: login, checkout, CRUD |
| Contracts | Generated types + schema tests against the backend's OpenAPI | Breaking API changes |

Test behavior, not implementation: query by role and label, assert on what the user sees. Do not snapshot entire components.

## Unit and component tests

- Vue: `@vue/test-utils` or `@testing-library/vue`; Nuxt: `@nuxt/test-utils` for components that need Nuxt context (`mountSuspended`).
- React: `@testing-library/react` + `@testing-library/user-event`.
- Mock at the boundary you own: the service or the network (MSW), never internals of the framework or the query library.
- Each test sets up its own state (`setActivePinia(createPinia())`, a new `QueryClient` with `retry: false`).

## Integration and E2E

- Playwright for critical journeys in a production build (`nuxi build`/`next build`), against a seeded backend or mocked network at the browser level.
- Use role-based locators; avoid CSS selectors tied to styling.
- Keep E2E few and valuable; most coverage lives in component and integration tests.

## SSR, hydration and state isolation tests

- E2E assertion that the browser console has no hydration warnings on key pages.
- Request two pages concurrently as two different users in a test and assert neither response contains the other's data (catches cross-request leaks).
- Assert that SSR HTML contains the critical content (SEO) by requesting the page without JavaScript.

## Accessibility, visual and performance tests

- `@axe-core/playwright` on key pages; fail on serious and critical violations.
- Visual regression (Playwright screenshots, or Storybook/Chromatic for a design system) for components with stable rendering; disable animations in those runs.
- Lighthouse CI with budgets for LCP, CLS, total JS per route.
- Animations: test that `prefers-reduced-motion` disables them (emulate in Playwright) and that cleanup runs on unmount.

## Lint and architecture tooling

Pick one tool per job; do not stack redundant tools.

| Job | Default | Alternatives / notes |
|---|---|---|
| Types | `tsc --noEmit` (React/Next), `nuxi typecheck`/`vue-tsc` (Vue/Nuxt) with `strict: true` | Add `noUncheckedIndexedAccess` |
| Lint | ESLint flat config (`@nuxt/eslint`, `eslint-config-next` with the ESLint CLI; `next lint` was removed in Next 16) | Oxlint as a fast first pass in large repos |
| Format | Prettier | Biome replaces ESLint + Prettier in React-only repos if the team prefers one tool |
| Unused files, exports, deps | Knip | |
| Architecture rules | dependency-cruiser (`folder-structure.md`) | `eslint-plugin-boundaries`; Madge is older (last published 2024-08, verified) |
| Dependency updates | Renovate or Dependabot | |
| Bundle size | Framework analyzers + budgets | |

## CI pipeline

1. Install with frozen lockfile.
2. Typecheck, lint, format check.
3. Architecture rules (dependency-cruiser) and Knip.
4. Unit and component tests with coverage.
5. Build.
6. E2E + axe on the built app.
7. Lighthouse budgets on preview deployments.
