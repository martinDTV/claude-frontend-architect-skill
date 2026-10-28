# TypeScript for frontends

TypeScript buys you refactoring safety and self-documenting boundaries only if the configuration is strict and types model the domain. The installed major governs the advice: read `node_modules/typescript/package.json` before relying on a feature.

## Contents
- Compiler configuration
- Type-checking in CI
- Modeling UI state
- Identifiers and domain primitives
- Contracts: schemas first, types inferred
- Components, composables and hooks
- Framework typing: Nuxt
- Framework typing: Next.js and React
- Casts, `any` and `unknown`
- Type-checking at scale
- TypeScript 7

## Compiler configuration

| Option | Setting | Why |
|---|---|---|
| `strict` | `true` | Everything below assumes it |
| `noUncheckedIndexedAccess` | `true` for new projects | `list[0]` is `T \| undefined`; stops a whole class of runtime crashes. Enabling it on a large codebase produces many errors: do it per directory with project references, or accept `!` at reviewed sites |
| `exactOptionalPropertyTypes` | Opt in when the team is ready | Distinguishes `{ a?: string }` from `{ a: string \| undefined }`; valuable for API payloads, noisy with libraries that pass `undefined` explicitly |
| `verbatimModuleSyntax` + `isolatedModules` | `true` | Forces `import type`, keeps builds correct under esbuild/Vite which compile files one at a time |
| `noImplicitOverride`, `noFallthroughCasesInSwitch` | `true` | Cheap, catches real mistakes |
| `skipLibCheck` | `true` | Checking `node_modules` declarations is slow and not your bug to fix |
| `moduleResolution` | `bundler` | Matches Vite, Nuxt and Next.js resolution |

Nuxt generates `.nuxt/tsconfig.json`; extend it and set `typescript.strict: true` in `nuxt.config.ts`. Next.js writes a `tsconfig.json` on first run; keep `strict: true` and add the options above. Do not fork the generated configs: add options, never remove paths or includes.

## Type-checking in CI

| Stack | Command | Notes |
|---|---|---|
| Vue (Vite) | `vue-tsc --noEmit` | `vue-tsc` 3.x; checks `.vue` templates when `strictTemplates` is on in `vueCompilerOptions` |
| Nuxt | `nuxt typecheck` | Runs `vue-tsc` with the generated config; set `typescript.typeCheck: true` only in dev if you accept slower HMR |
| React / Next.js | `tsc --noEmit` | `next build` type-checks too, but a separate step fails faster |

Run type-checking before tests and before the build. A green build with `ignoreBuildErrors` or `typescript.typeCheck: false` and no CI step means the types are documentation, not a guarantee.

## Modeling UI state

Boolean soup (`loading`, `error`, `data`, `isEmpty`) allows impossible combinations (`loading && error`). Model each view's state as a discriminated union and match it exhaustively; the compiler then tells you every place that needs a new state.

```ts
// @verify vue:lib/types/ui-state.ts
/** A value that is only ever in one of these states. No `loading: boolean` next to `error: string | null`. */
export type AsyncState<T, E = Error> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: E }
  | { status: 'empty' }
  | { status: 'success'; data: T }

/** Turns a resolved list into `empty` or `success`, so components never check `data.length` themselves. */
export function fromList<T>(items: readonly T[]): AsyncState<readonly T[]> {
  return items.length === 0 ? { status: 'empty' } : { status: 'success', data: items }
}

/** Exhaustive matcher: adding a status breaks compilation everywhere it is matched. */
export function matchState<T, E, R>(
  state: AsyncState<T, E>,
  cases: { idle: () => R; loading: () => R; error: (error: E) => R; empty: () => R; success: (data: T) => R },
): R {
  switch (state.status) {
    case 'idle':
      return cases.idle()
    case 'loading':
      return cases.loading()
    case 'error':
      return cases.error(state.error)
    case 'empty':
      return cases.empty()
    case 'success':
      return cases.success(state.data)
    default:
      return assertNever(state)
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`)
}

/** Branded identifiers: a PatientId cannot be passed where an OrderId is expected, at zero runtime cost. */
declare const brand: unique symbol
export type Brand<T, Name extends string> = T & { readonly [brand]: Name }
export type PatientId = Brand<string, 'PatientId'>
export type OrderId = Brand<string, 'OrderId'>

export const PatientId = (value: string): PatientId => value as PatientId
export const OrderId = (value: string): OrderId => value as OrderId
```

Pinia Colada's `state` and TanStack Query's `status` already are discriminated unions; branch on them in templates (`state.status === 'success'` narrows `state.data`) instead of reading `data` and `error` separately.

```ts
// @verify vue:lib/types/ui-state.test.ts
import { describe, expect, it } from 'vitest'
import { type AsyncState, fromList, matchState, OrderId, PatientId } from './ui-state'

describe('AsyncState', () => {
  it('derives empty vs success from a list and matches exhaustively', () => {
    const render = (s: AsyncState<readonly string[]>) =>
      matchState(s, { idle: () => 'idle', loading: () => 'loading', error: (e) => e.message, empty: () => 'nothing yet', success: (d) => d.join(',') })
    expect(render(fromList([]))).toBe('nothing yet')
    expect(render(fromList(['a', 'b']))).toBe('a,b')
    expect(render({ status: 'error', error: new Error('boom') })).toBe('boom')
  })

  it('keeps ids apart at the type level', () => {
    const patient = PatientId('p-1')
    const order = OrderId('o-1')
    const loadPatient = (id: PatientId) => id
    expect(loadPatient(patient)).toBe('p-1')
    // @ts-expect-error an OrderId is not a PatientId
    loadPatient(order)
  })
})
```

Other patterns that pay off:
- `as const` for lookup tables and option lists; derive the union with `(typeof OPTIONS)[number]['value']` instead of retyping it.
- `satisfies` to check an object against a type while keeping its literal types (`routes satisfies Record<string, RouteMeta>`, `colada.options.ts` with `satisfies PiniaColadaOptions`).
- Exhaustive `switch` with `assertNever` for every enum-like union: statuses, roles, permission actions, error kinds.

## Identifiers and domain primitives

Branded types (above) for ids that cross the app: `PatientId`, `OrganizationId`, `OrderId`. Apply the brand where the value enters (schema `transform`, route param parsing), not in every component. Money as integer minor units or a decimal type with a brand (`Cents`); dates as ISO strings at the boundary and `Date`/`Temporal` (when available) inside, never both for the same field.

## Contracts: schemas first, types inferred

Write the schema (Zod 4 or Valibot 1) and infer the type: `export type User = z.infer<typeof userSchema>`. One source of truth; runtime validation at the boundary (`api-clients.md`). With OpenAPI, generate types (`openapi-typescript`) and still validate third-party or critical responses. Use `Pick`/`Omit`/`Partial` at boundaries to derive input types from entity types (`CreateUserInput = Pick<User, 'email' | 'fullName'>`), not to build deep conditional type gymnastics in product code.

## Components, composables and hooks

**Vue**
- `defineProps<Props>()` with reactive destructure defaults (3.5+) or `withDefaults`; `defineEmits<{ change: [value: T] }>()`; `defineSlots<{ default(props: { item: T }): unknown }>()`; `defineModel<T>()`.
- Generic components: `<script setup lang="ts" generic="T extends { id: string }">` for lists, selects and tables (`vue-composition-api.md` has a compiled `UiSelect`).
- Composables: accept `MaybeRefOrGetter<T>`, read with `toValue()`, return an object of `Ref`/`ComputedRef`/functions. Return `Readonly<Ref<T>>` (`readonly(ref)`) for state consumers must not write. Avoid returning `reactive` objects (destructuring loses reactivity).
- `provide`/`inject` with `InjectionKey<T>` (`axios.md` shows `httpKey`); throw when the injection is missing instead of returning `undefined`.
- Setup stores infer their own types; export the store type with `ReturnType<typeof useCartStore>` when a composable needs it.

**React**
- Typed props via `interface Props`; `ref` is a normal prop in React 19.
- Generic components: `function List<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode })`.
- Hooks return tuples or objects; mark stable callbacks with the type of the handler, not `Function`.
- Discriminated props (`{ variant: 'link'; href: string } | { variant: 'button'; onClick: () => void }`) instead of optional props that depend on each other.

## Framework typing: Nuxt

- Plugin-provided instances are typed automatically from `provide` (`useNuxtApp().$api`). For types that cannot be inferred, augment: `declare module '#app' { interface NuxtApp { $api: AxiosInstance } }` and the same for `@vue/runtime-core` `ComponentCustomProperties` if templates use it.
- Page meta: `declare module '#app' { interface PageMeta { requiresRole?: Role } }` so `definePageMeta({ requiresRole: 'admin' })` is checked.
- Runtime config is typed from `nuxt.config.ts` defaults; keep defaults with the right primitive type (`''` for strings, `false` for booleans) so overrides via `NUXT_*` env vars are typed.
- Typed routes: `experimental.typedPages: true` generates route names and params for `navigateTo`/`useRoute('orders-id')`; verify behavior in the installed version before relying on it in a large app.
- `shared/types` is auto-imported into `app/` and `server/`: put wire types used on both sides there, nothing that imports Vue or Nitro.
- `env.d.ts` for `import.meta.env` keys (`ImportMetaEnv`) when Vite env vars are used outside `runtimeConfig`.

## Framework typing: Next.js and React

- `process.env` is `string | undefined`: read server env once in a validated config module (`z.object({ API_URL: z.url() }).parse(process.env)`), never scattered `process.env.X!`.
- Route params: `params` and `searchParams` are promises in the App Router (Next 15+); type them `Promise<{ id: string }>` and await. For client search params use `nuqs` (2.x) parsers to get typed, URL-backed state.
- Server Functions: type the state of `useActionState` as a discriminated union (`{ ok: true } | { ok: false; errors }`), as in `nextjs.md`.
- `server-only` modules fail the build when imported by a Client Component: that is a type-level boundary enforced by the bundler, use it.

## Casts, `any` and `unknown`

- Data entering the app is `unknown` until validated. `as User` on an API response is a lie that moves the crash into a template.
- Legitimate casts: narrowing after a runtime check the compiler cannot see (`event.target as HTMLInputElement` after an `instanceof` check), branding at a boundary, and interop with poorly typed libraries (isolate in one adapter file with a comment).
- `any` only to silence a third-party type bug, locally and with `// eslint-disable-next-line` plus the reason. `@ts-expect-error` over `@ts-ignore`: it fails when the error disappears.
- Non-null assertions (`!`) are casts too; prefer an early return or `??` with a default.

## Type-checking at scale

Symptoms: `vue-tsc`/`tsc` above a few minutes, editors lagging, CI dominated by typecheck.

- Measure first: `tsc --extendedDiagnostics` (check time, memory, number of types); `--generateTrace` for the worst files.
- Usual causes: huge inferred unions (every route, every icon name), deep generic utilities applied everywhere, `as const` tables with thousands of entries, libraries whose types explode (`skipLibCheck` must be on), barrel files that make every change recheck everything.
- Fixes: explicit return types on exported functions and composables (stops inference cascades), split monoliths into project references (`tsc -b`) along module boundaries, `incremental: true` with a cached `tsBuildInfoFile` in CI, keep generated API types in their own project, avoid importing the whole of a giant type-only package when a subset is enough.
- In Nuxt, `typescript.typeCheck` in dev slows HMR on large apps; run `nuxt typecheck` in CI and on demand instead.

## TypeScript 7

`typescript` 7.0.2 is the latest major on npm (verified 2026-10-28), the first release line of the native compiler the TypeScript team announced; read its release notes before assuming flag parity with 5.x. Before upgrading a project check: `vue-tsc` support for that major, Nuxt and Next.js peer ranges, ESLint typed rules (`typescript-eslint`), and build-time emit expectations. Pin the major in `package.json`; let the installed version, not this document, decide which flags exist. The patterns above (unions, brands, schemas, strict config) do not change between majors.
