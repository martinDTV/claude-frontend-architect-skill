# Persistence

## Contents
- What may be persisted
- Choosing the storage
- Vue / Nuxt: pinia-plugin-persistedstate, useCookie, VueUse
- React / Next.js: Zustand persist
- Versioning and migrations
- Cross-tab synchronization
- SSR and hydration
- Security rules

## What may be persisted

| Persist | Do not persist |
|---|---|
| Theme, language, layout preferences | Access or refresh tokens (use `HttpOnly` cookies) |
| Dismissed banners, onboarding progress | Passwords, payment data, personal health or financial data |
| Unsent drafts (with expiry) | Server data (the query cache refetches it) |
| Cart for anonymous users (with expiry) | Permissions or roles (always come from the server) |
| Recently viewed IDs | Anything the server must validate |

## Choosing the storage

| Storage | Capacity | Sent to server | Readable by JS | SSR-readable | Use for |
|---|---|---|---|---|---|
| `HttpOnly` cookie | ~4 KB | Yes | No | Yes | Sessions |
| Regular cookie | ~4 KB | Yes | Yes | Yes | Preferences needed during SSR (theme, locale) to avoid flashes |
| `localStorage` | ~5 MB | No | Yes | No | Preferences and drafts not needed on SSR |
| `sessionStorage` | ~5 MB | No | Yes | No | Per-tab temporary state |
| IndexedDB | Large | No | Yes | No | Offline data, large drafts, files (via a wrapper such as `idb-keyval`) |

Anything readable by JavaScript is readable by an XSS payload.

## Vue and Nuxt

`pinia-plugin-persistedstate` (4.x; peer `pinia >=3`; last published 2025-11: maintained but slow-moving, check its issues before adopting). It has a Nuxt module that persists to cookies by default, which makes values available during SSR.

```ts
// @verify vue:features/preferences/preferences.store.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Theme = 'light' | 'dark' | 'system'

export const usePreferencesStore = defineStore(
  'preferences',
  () => {
    const theme = ref<Theme>('system')
    const sidebarCollapsed = ref(false)
    const lastVisitedProjectId = ref<string | null>(null)

    function setTheme(next: Theme) {
      theme.value = next
    }

    return { theme, sidebarCollapsed, lastVisitedProjectId, setTheme }
  },
  {
    persist: {
      key: 'preferences:v1',
      pick: ['theme', 'sidebarCollapsed'],
    },
  },
)
```

```ts
// @verify vue:features/preferences/preferences.store.test.ts
import { createPinia, setActivePinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from 'vue'
import { usePreferencesStore } from './preferences.store'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  }
}

describe('preferences persistence', () => {
  let storage: Storage

  beforeEach(() => {
    storage = memoryStorage()
    const pinia = createPinia().use(createPersistedState({ storage }))
    createApp({}).use(pinia)
    setActivePinia(pinia)
  })

  it('persists only the picked fields under a versioned key', () => {
    const prefs = usePreferencesStore()
    prefs.setTheme('dark')
    prefs.lastVisitedProjectId = 'p-1'
    prefs.$persist()

    const saved = JSON.parse(storage.getItem('preferences:v1') ?? '{}') as Record<string, unknown>
    expect(saved).toEqual({ theme: 'dark', sidebarCollapsed: false })
  })
})
```

Alternatives without a plugin: Nuxt `useCookie('theme', { maxAge, sameSite: 'lax' })` for SSR-visible preferences; VueUse `useLocalStorage(key, default)` for client-only values.

## React and Next.js

Zustand's `persist` middleware has versioning and migrations built in.

```ts
// @verify react:features/preferences/preferences.store.ts
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface PreferencesState {
  theme: Theme
  sidebarCollapsed: boolean
  setTheme: (theme: Theme) => void
  toggleSidebar: () => void
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'preferences',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed }),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<PreferencesState> & { darkMode?: boolean }
        if (version < 2 && state.darkMode !== undefined) {
          return { theme: state.darkMode ? 'dark' : 'light', sidebarCollapsed: state.sidebarCollapsed ?? false }
        }
        return state as PreferencesState
      },
    },
  ),
)
```

In Next.js, a module-level Zustand store is shared by all requests during SSR. Keep persisted, per-user stores client-only, or create the store per request through a context provider (Zustand's documented Next.js pattern) when it must render on the server.

## Versioning and migrations

- Include a version in the key or use the library's `version` + `migrate`.
- Migrations must accept unknown, partial or corrupted data: validate with a schema and fall back to defaults instead of crashing.
- Add expiry for drafts and anonymous carts (store a timestamp; discard after N days).

## Cross-tab synchronization

- Logout, theme and cart changes should propagate: listen to the `storage` event or use `BroadcastChannel` (VueUse `useBroadcastChannel`, `useStorage` syncs automatically).
- On logout, clear persisted user-scoped state in all tabs.

## SSR and hydration

`localStorage` does not exist on the server. Reading it during SSR fails; reading it during client setup causes hydration mismatches. Options: store SSR-relevant preferences in cookies, render a neutral state and apply persisted values after mount, or use the library's hydration hooks. Theme flashes are solved with a cookie read on the server, or a tiny inline script that sets the class before paint.

## Security rules

- Never persist tokens in `localStorage` for convenience. If a third-party SDK forces it, document the risk in an ADR and harden against XSS (CSP, sanitization).
- Do not persist data that would expose another user's information on a shared device after logout.
- Treat persisted data as untrusted input: validate when reading.
