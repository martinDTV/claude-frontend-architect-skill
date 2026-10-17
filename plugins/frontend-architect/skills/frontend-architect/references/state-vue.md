# State in Vue and Nuxt

## Contents
- Classify before choosing
- Decision matrix
- Pinia: setup stores, composition, SSR, plugins, testing
- Nuxt useState
- VueUse
- Pinia ORM
- Anti-patterns

## Classify before choosing

Most state problems come from putting every kind of state in one tool. Classify each piece first:

| # | Kind | Example | Default home |
|---|---|---|---|
| 1 | Local UI | Is this dropdown open | `ref` in the component |
| 2 | Shared client state | Cart contents before checkout, current workspace | Pinia store |
| 3 | Remote (server-owned) | Orders, users, products | Pinia Colada (or `useFetch` for page-only data) |
| 4 | Server cache policy | Staleness, refetch, invalidation | Pinia Colada configuration |
| 5 | Persistent client state | Theme, dismissed banners, draft form | Pinia + persistence plugin, or `useCookie`/VueUse storage |
| 6 | Derived | Totals, filtered lists | `computed` (in component, composable or store getter) |
| 7 | Form | Field values, errors, dirty/touched | Component state or a form library; not a global store |
| 8 | Authentication | Current user, roles | Session cookie (source of truth) + a small store or `useState` for the user object |
| 9 | Normalized entities | Many related entities edited in several views | Pinia ORM (rarely needed) |
| 10 | Cross-tab synced | Logout in all tabs | `BroadcastChannel` / storage events (VueUse `useBroadcastChannel`, `useStorage`) |
| 11 | Navigation | Filters, page, sort, selected tab | **URL query params** (`useRoute`/`useRouter`) so links and back button work |
| 12 | Temporary | Toast queue, wizard step | Component or composable; a tiny store only if global |

## Decision matrix

| Question | If yes |
|---|---|
| Does the server own it? | Query cache (Pinia Colada / `useFetch`). Never a Pinia copy |
| Can it be computed from other state? | `computed`. Never stored |
| Should a link or refresh restore it? | URL |
| Used by one component or a parent and children? | Local `ref` + props, or `provide`/`inject` |
| Needed across distant parts of the app, owned by the client? | Pinia store |
| Needed on SSR and client, simple and serializable, no actions? | Nuxt `useState` |
| Must survive reload? | Persistence (`persistence.md`), after checking it is safe to store |

## Pinia

Use **setup stores**: same mental model as composables, full TypeScript inference, can use other composables.

```ts
// @verify vue:features/cart/cart.store.ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface CartLine {
  productId: string
  name: string
  unitPrice: number
  quantity: number
}

export const useCartStore = defineStore('cart', () => {
  const lines = ref<CartLine[]>([])

  const itemCount = computed(() => lines.value.reduce((n, line) => n + line.quantity, 0))
  const subtotal = computed(() => lines.value.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0))

  function add(line: Omit<CartLine, 'quantity'>, quantity = 1) {
    const existing = lines.value.find((l) => l.productId === line.productId)
    if (existing) existing.quantity += quantity
    else lines.value.push({ ...line, quantity })
  }

  function remove(productId: string) {
    lines.value = lines.value.filter((l) => l.productId !== productId)
  }

  function clear() {
    lines.value = []
  }

  return { lines, itemCount, subtotal, add, remove, clear }
})
```

```ts
// @verify vue:features/cart/cart.store.test.ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCartStore } from './cart.store'

describe('cart store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('merges quantities of the same product and derives totals', () => {
    const cart = useCartStore()
    cart.add({ productId: 'p1', name: 'Mug', unitPrice: 12 })
    cart.add({ productId: 'p1', name: 'Mug', unitPrice: 12 }, 2)
    expect(cart.lines).toHaveLength(1)
    expect(cart.itemCount).toBe(3)
    expect(cart.subtotal).toBe(36)
  })
})
```

Rules:
- One store per business concern, defined in the feature (`features/cart/cart.store.ts`). No `useAppStore` holding everything.
- Return everything from a setup store (state, getters, actions) or SSR hydration and devtools miss it. Private state belongs in a composable or a non-returned closure only if it does not need hydration.
- Destructure with `storeToRefs(store)` for state and getters; actions can be destructured directly.
- Compose stores by calling one store inside another store's action or getter, not at module level. Avoid circular reads in setup.
- Money in integer minor units (cents) or a decimal library when precision matters.
- **SSR**: with `@pinia/nuxt`, each request gets its own Pinia. Never create stores or Pinia at module level in server code. Values must be serializable; wrap non-serializable values with `skipHydrate`.
- **Pinia 4** (verified): ESM only, and `@vue/devtools-api` must be installed alongside `pinia`. The store API is unchanged from v3.
- **Plugins** for cross-cutting behavior: persistence, logging, undo. Keep them few; each runs for every store.
- **Testing**: `setActivePinia(createPinia())` for store unit tests (above); `createTestingPinia()` from `@pinia/testing` for component tests that need stubbed actions.

## Nuxt useState

`useState<T>(key, init)` gives SSR-safe, per-request shared state with no library. Use it for small, serializable values (current locale, a feature flag snapshot, the session user object). Move to Pinia when you need actions, getters, devtools, plugins or tests around it.

## VueUse

Prefer VueUse for browser-state composables instead of hand-rolled ones: `useStorage`/`useLocalStorage`, `useBroadcastChannel`, `usePreferredDark`, `useMediaQuery`, `useIntersectionObserver`, `useDebounceFn`, `useEventListener`. They handle SSR guards and cleanup. Verify API names against the installed major (v15 at the time of writing).

## Pinia ORM

Normalizes entities and relations (users ↔ posts ↔ comments) in Pinia with a query API. Justified when the same entities are edited in many views, relations are deep, and you need consistent local updates (offline-capable editors, complex admin tools). Not justified for typical CRUD screens, where a query cache with invalidation is simpler. Verified: v2.0.0 requires Node >= 22.12 for tooling. Write an ADR before adopting it.

## Anti-patterns

- Fetching in a store action and storing the response (`users: User[]` in Pinia). Use Pinia Colada; the cache already deduplicates, refetches and shares.
- A store for form fields of one page.
- Mirroring route params into a store instead of reading `useRoute()`.
- Persisting the whole store, including server data and secrets.
- Mutating store state from components across the app instead of through actions with names that express intent.
