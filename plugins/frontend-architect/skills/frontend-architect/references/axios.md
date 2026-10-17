# Axios implementation

Read `api-clients.md` first: use this only when Axios is justified. Every block marked `@verify` is compiled and tested in this repository's CI against current versions.

## Contents
- Shared core: errors, contract validation, client factory
- A domain service
- Query keys
- Vue (SPA): providing the client, composables with Pinia Colada
- Nuxt: per-request client plugin, composables with Pinia Colada, SSR rules
- React / Next.js: provider, hooks with TanStack Query, SSR rules
- Testing

## Shared core (framework-agnostic)

Place in `lib/http/` (Nuxt: `app/lib/http/`; Next: `src/lib/http/`).

### Errors

```ts
// @verify vue,react,next,nuxt:lib/http/errors.ts
import { isAxiosError, isCancel } from 'axios'

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'canceled'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'rate_limited'
  | 'server'
  | 'contract'
  | 'unknown'

export class ApiError extends Error {
  override readonly name = 'ApiError'

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'validation',
  429: 'rate_limited',
}

interface ProblemDetails {
  title?: string
  detail?: string
  code?: string
  errors?: unknown
}

function asProblemDetails(body: unknown): ProblemDetails {
  return typeof body === 'object' && body !== null ? (body as ProblemDetails) : {}
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (isCancel(error)) return new ApiError('canceled', 'Request was canceled')
  if (!isAxiosError(error)) {
    return new ApiError('unknown', error instanceof Error ? error.message : 'Unknown error')
  }
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new ApiError('timeout', 'The request timed out')
  }
  if (!error.response) return new ApiError('network', 'Network error')

  const { status, data } = error.response
  const problem = asProblemDetails(data)
  const kind = KIND_BY_STATUS[status] ?? (status >= 500 ? 'server' : 'unknown')
  const message = problem.detail ?? problem.title ?? error.message
  return new ApiError(kind, message, status, problem.code, problem.errors ?? data)
}
```

### Contract validation

```ts
// @verify vue,react,next,nuxt:lib/http/contract.ts
import type { z } from 'zod'
import { ApiError } from './errors'

/** Validates an API response at the boundary and returns the inferred domain type. */
export function parseResponse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ApiError('contract', 'Unexpected response shape', undefined, 'contract_mismatch', result.error.issues)
  }
  return result.data
}
```

### Client factory

The factory receives everything request-specific (headers, token getter, refresh callback), so the same code is safe per request on the server and once per app in the browser. The 401 handler refreshes **once** even when many requests fail at the same time.

```ts
// @verify vue,react,next,nuxt:lib/http/client.ts
import axios, { type AxiosInstance, type InternalAxiosRequestConfig, isAxiosError } from 'axios'
import { toApiError } from './errors'

export interface HttpClientOptions {
  baseURL: string
  timeoutMs?: number
  headers?: Record<string, string>
  /** Send cookies cross-origin in the browser (cookie-based sessions). */
  withCredentials?: boolean
  /** Bearer token source, if the API uses tokens. Read per request, never cached here. */
  getAccessToken?: () => string | undefined | Promise<string | undefined>
  /** Try to refresh the session; resolve true if requests may be retried. */
  refreshSession?: () => Promise<boolean>
}

export function createHttpClient(options: HttpClientOptions): AxiosInstance {
  const http = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeoutMs ?? 15_000,
    withCredentials: options.withCredentials ?? false,
    headers: { Accept: 'application/json', ...options.headers },
  })

  http.interceptors.request.use(async (config) => {
    const token = await options.getAccessToken?.()
    if (token) config.headers.set('Authorization', `Bearer ${token}`)
    return config
  })

  const retried = new WeakSet<InternalAxiosRequestConfig>()
  let refreshing: Promise<boolean> | null = null

  http.interceptors.response.use(undefined, async (error: unknown) => {
    const config = isAxiosError(error) ? error.config : undefined
    const status = isAxiosError(error) ? error.response?.status : undefined

    if (status === 401 && config && options.refreshSession && !retried.has(config)) {
      retried.add(config)
      refreshing ??= options.refreshSession().finally(() => {
        refreshing = null
      })
      if (await refreshing) return http.request(config)
    }
    throw toApiError(error)
  })

  return http
}
```

Do not add retry interceptors: Pinia Colada and TanStack Query already retry reads (see `api-clients.md`).

## A domain service

One file per business area. Factory function receiving the instance; methods accept a `signal`; responses validated.

```ts
// @verify vue,react,nuxt:features/users/users.schemas.ts
import { z } from 'zod'

export const userSchema = z.object({
  id: z.number().int(),
  email: z.email(),
  fullName: z.string(),
  isActive: z.boolean(),
})

export const userPageSchema = z.object({
  items: z.array(userSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

export type User = z.infer<typeof userSchema>
export type UserPage = z.infer<typeof userPageSchema>

export interface UserListParams {
  limit: number
  offset: number
  search?: string
}

export interface CreateUserInput {
  email: string
  fullName: string
}

export type UpdateUserInput = Partial<Pick<User, 'fullName' | 'isActive'>>
```

```ts
// @verify vue,react,nuxt:features/users/users.service.ts
import type { AxiosInstance } from 'axios'
import { parseResponse } from '@/lib/http/contract'
import {
  type CreateUserInput,
  type UpdateUserInput,
  type User,
  type UserListParams,
  type UserPage,
  userPageSchema,
  userSchema,
} from './users.schemas'

interface RequestOptions {
  signal?: AbortSignal
}

export function createUsersService(http: AxiosInstance) {
  return {
    async list(params: UserListParams, { signal }: RequestOptions = {}): Promise<UserPage> {
      const { data } = await http.get<unknown>('/users', { params, signal })
      return parseResponse(userPageSchema, data)
    },

    async get(id: number, { signal }: RequestOptions = {}): Promise<User> {
      const { data } = await http.get<unknown>(`/users/${id}`, { signal })
      return parseResponse(userSchema, data)
    },

    async create(input: CreateUserInput): Promise<User> {
      const { data } = await http.post<unknown>('/users', input)
      return parseResponse(userSchema, data)
    },

    async update(id: number, input: UpdateUserInput): Promise<User> {
      const { data } = await http.patch<unknown>(`/users/${id}`, input)
      return parseResponse(userSchema, data)
    },

    async remove(id: number): Promise<void> {
      await http.delete(`/users/${id}`)
    },
  }
}

export type UsersService = ReturnType<typeof createUsersService>
```

### Query keys

Hierarchical keys let you invalidate a whole domain (`['users']`) or one entry.

```ts
// @verify vue,react,nuxt:features/users/users.keys.ts
import type { UserListParams } from './users.schemas'

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (params: UserListParams) =>
    [...userKeys.lists(), { limit: params.limit, offset: params.offset, search: params.search ?? '' }] as const,
  detail: (id: number) => [...userKeys.all, 'detail', id] as const,
}
```

## Vue SPA with Pinia Colada

Provide the instance once at app creation; read it with `inject`.

```ts
// @verify vue:lib/http/injection.ts
import type { AxiosInstance } from 'axios'
import { type InjectionKey, inject } from 'vue'

export const httpKey: InjectionKey<AxiosInstance> = Symbol('http')

export function useHttp(): AxiosInstance {
  const http = inject(httpKey)
  if (!http) throw new Error('HTTP client not provided. Call app.provide(httpKey, createHttpClient(...)).')
  return http
}
```

```ts
// @verify vue:features/users/composables/useUsers.ts
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { type MaybeRefOrGetter, toValue } from 'vue'
import { useHttp } from '@/lib/http/injection'
import type { CreateUserInput, UserListParams } from '../users.schemas'
import { userKeys } from '../users.keys'
import { createUsersService } from '../users.service'

export function useUsersService() {
  return createUsersService(useHttp())
}

export function useUserList(params: MaybeRefOrGetter<UserListParams>) {
  const users = useUsersService()
  return useQuery({
    key: () => userKeys.list(toValue(params)),
    query: ({ signal }) => users.list(toValue(params), { signal }),
  })
}

export function useUser(id: MaybeRefOrGetter<number>) {
  const users = useUsersService()
  return useQuery({
    key: () => userKeys.detail(toValue(id)),
    query: ({ signal }) => users.get(toValue(id), { signal }),
  })
}

export function useCreateUser() {
  const users = useUsersService()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: CreateUserInput) => users.create(input),
    onSettled: () => queryCache.invalidateQueries({ key: userKeys.lists() }),
  })
}
```

Wiring in `main.ts`: `app.use(createPinia())`, `app.use(PiniaColada)`, `app.provide(httpKey, createHttpClient({ baseURL: import.meta.env.VITE_API_URL, withCredentials: true }))`.

## Nuxt

Rules:
- Create the instance in a **plugin**. Plugins run once per request on the server and once in the browser, so per-user data never leaks between requests.
- On the server, use an absolute internal URL and forward the incoming cookie; in the browser, use the public URL.
- Prefer `$fetch` if none of the Axios reasons apply (see `nuxt.md`).

```ts
// @verify nuxt:/nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt', '@pinia/colada-nuxt'],
  runtimeConfig: {
    apiBaseServer: 'http://localhost:8000/api/v1',
    public: { apiBase: '/api/v1' },
  },
  typescript: { strict: true },
  compatibilityDate: '2026-10-01',
})
```

```ts
// @verify nuxt:plugins/api.ts
import { createHttpClient } from '~/lib/http/client'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const api = createHttpClient({
    baseURL: import.meta.server ? config.apiBaseServer : config.public.apiBase,
    headers: import.meta.server ? useRequestHeaders(['cookie']) : {},
    withCredentials: true,
  })
  return { provide: { api } }
})
```

The plugin's `provide` makes `useNuxtApp().$api` fully typed. The shared core files (`errors.ts`, `contract.ts`, `client.ts`) and the feature's `users.schemas.ts`, `users.service.ts` and `users.keys.ts` are the same as above; in Nuxt the `@/` import alias resolves to `app/`.

```ts
// @verify nuxt:features/users/composables/useUsers.ts
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { type MaybeRefOrGetter, toValue } from 'vue'
import { useNuxtApp } from '#imports'
import type { CreateUserInput, UserListParams } from '../users.schemas'
import { userKeys } from '../users.keys'
import { createUsersService } from '../users.service'

export function useUsersService() {
  return createUsersService(useNuxtApp().$api)
}

export function useUserList(params: MaybeRefOrGetter<UserListParams>) {
  const users = useUsersService()
  return useQuery({
    key: () => userKeys.list(toValue(params)),
    query: ({ signal }) => users.list(toValue(params), { signal }),
  })
}

export function useCreateUser() {
  const users = useUsersService()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: CreateUserInput) => users.create(input),
    onSettled: () => queryCache.invalidateQueries({ key: userKeys.lists() }),
  })
}
```

```vue
<!-- @verify nuxt:features/users/components/UserList.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUserList } from '../composables/useUsers'

const page = ref(0)
const params = computed(() => ({ limit: 20, offset: page.value * 20 }))
const { state, asyncStatus, refetch } = useUserList(params)
</script>

<template>
  <section aria-labelledby="users-title">
    <h2 id="users-title">Users</h2>
    <p v-if="state.status === 'pending'">Loading users…</p>
    <div v-else-if="state.status === 'error'" role="alert">
      <p>{{ state.error.message }}</p>
      <button type="button" @click="refetch()">Try again</button>
    </div>
    <p v-else-if="state.data.items.length === 0">No users yet.</p>
    <ul v-else :aria-busy="asyncStatus === 'loading'">
      <li v-for="user in state.data.items" :key="user.id">{{ user.fullName }}</li>
    </ul>
  </section>
</template>
```

Pinia Colada prefetches queries during SSR automatically and hydrates them; do not also fetch the same data with `useFetch`.

## React and Next.js

Rules:
- In **Server Components** and Server Functions, call the backend with `fetch` (see `nextjs.md`). Use the Axios layer for client-side server state with TanStack Query.
- Client Components also render on the server during SSR. Never keep per-user tokens in a module-level instance; with cookie sessions (`withCredentials`), the browser attaches credentials and the instance holds none.
- Create the `QueryClient` once per browser session and once per server request.

```tsx
// @verify react,next:providers/http-provider.tsx
'use client'
import type { AxiosInstance } from 'axios'
import { createContext, type ReactNode, useContext, useState } from 'react'
import { createHttpClient } from '@/lib/http/client'

const HttpContext = createContext<AxiosInstance | null>(null)

export function HttpProvider({ baseURL, children }: { baseURL: string; children: ReactNode }) {
  const [http] = useState(() => createHttpClient({ baseURL, withCredentials: true }))
  return <HttpContext value={http}>{children}</HttpContext>
}

export function useHttp(): AxiosInstance {
  const http = useContext(HttpContext)
  if (!http) throw new Error('useHttp must be used inside <HttpProvider>')
  return http
}
```

```ts
// @verify react:features/users/hooks/useUsers.ts
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useHttp } from '@/providers/http-provider'
import type { CreateUserInput, UserListParams } from '../users.schemas'
import { userKeys } from '../users.keys'
import { createUsersService } from '../users.service'

export function useUsersService() {
  const http = useHttp()
  return useMemo(() => createUsersService(http), [http])
}

export function useUserList(params: UserListParams) {
  const users = useUsersService()
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: ({ signal }) => users.list(params, { signal }),
  })
}

export function useCreateUser() {
  const users = useUsersService()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateUserInput) => users.create(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: userKeys.lists() }),
  })
}
```

```tsx
// @verify react,next:providers/query-provider.tsx
'use client'
import { isServer, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (isServer) return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

## Testing

Test the client and services with a custom Axios adapter: no network, no extra dependency.

```ts
// @verify vue:lib/http/client.test.ts
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { createHttpClient } from './client'
import { ApiError } from './errors'

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  return { data, status, statusText: String(status), headers: {}, config }
}

function reject(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<never> {
  const response = respond(config, status, data)
  return Promise.reject(Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, config, response }))
}

describe('createHttpClient', () => {
  it('normalizes Problem Details into ApiError', async () => {
    const http = createHttpClient({ baseURL: 'http://api.test' })
    const adapter: AxiosAdapter = (config) =>
      reject(config, 409, { title: 'Conflict', detail: 'Email already registered', code: 'email_taken' })
    http.defaults.adapter = adapter

    const error = await http.get('/users').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'conflict', status: 409, code: 'email_taken', message: 'Email already registered' })
  })

  it('refreshes the session once for concurrent 401s and retries both requests', async () => {
    let sessionValid = false
    const refreshSession = vi.fn(async () => {
      sessionValid = true
      return true
    })
    const http = createHttpClient({ baseURL: 'http://api.test', refreshSession })
    http.defaults.adapter = (config) =>
      sessionValid ? Promise.resolve(respond(config, 200, { ok: true })) : reject(config, 401, {})

    const [a, b] = await Promise.all([http.get('/a'), http.get('/b')])
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(a.data).toEqual({ ok: true })
    expect(b.data).toEqual({ ok: true })
  })

  it('does not loop when the refresh fails', async () => {
    const refreshSession = vi.fn(async () => false)
    const http = createHttpClient({ baseURL: 'http://api.test', refreshSession })
    http.defaults.adapter = (config) => reject(config, 401, {})

    await expect(http.get('/a')).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })
})
```

```ts
// @verify vue:features/users/users.service.test.ts
import type { AxiosResponse } from 'axios'
import { describe, expect, it } from 'vitest'
import { createHttpClient } from '@/lib/http/client'
import { createUsersService } from './users.service'

describe('users service', () => {
  it('rejects a response that breaks the contract', async () => {
    const http = createHttpClient({ baseURL: 'http://api.test' })
    http.defaults.adapter = async (config): Promise<AxiosResponse> => ({
      data: { id: '1', email: 'not-an-email' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
    await expect(createUsersService(http).get(1)).rejects.toMatchObject({ kind: 'contract' })
  })
})
```

For component and composable tests, mock the service (not Axios) or use MSW at the network level; see `testing.md`.
