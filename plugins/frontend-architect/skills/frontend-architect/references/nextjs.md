# Next.js (App Router)

Written against Next.js 16 (verified: 16.4.x on npm). Check the installed version first: Next 15 and 16 differ in request interception (`middleware.ts` vs `proxy.ts`) and caching (implicit fetch caching vs Cache Components with `"use cache"`).

## Contents
- Server and Client Components
- Data fetching on the server
- Server Functions (Server Actions)
- Route Handlers
- Request interception: proxy.ts
- Caching and revalidation (Next 16)
- Streaming, loading and error boundaries
- Metadata, SEO, images, fonts
- Authentication
- Pitfalls

## Server and Client Components

Components are **Server Components by default**. Add `'use client'` only to the leaves that need state, effects, event handlers or browser APIs.

| Needs | Component |
|---|---|
| Fetch data, read secrets, access the DB or backend directly | Server |
| `useState`, `useEffect`, event handlers, browser APIs, TanStack Query, animation libraries | Client |
| Static markup, layout, text | Server |

Rules:
- Push `'use client'` down: a page that is mostly static with one interactive filter is a Server Component rendering a small Client Component.
- Pass Server Components as `children` to Client Components to keep them on the server.
- Props crossing the boundary must be serializable (no functions except Server Functions, no class instances).
- Mark server-only modules with `import 'server-only'` so a client import fails the build.

## Data fetching on the server

Fetch in Server Components with `fetch`, close to where data is used. Parallelize independent requests; never chain awaits that do not depend on each other.

```ts
// @verify next:features/users/server.ts
import 'server-only'
import { cookies } from 'next/headers'
import { z } from 'zod'

const userSchema = z.object({ id: z.number().int(), email: z.email(), fullName: z.string() })
export type User = z.infer<typeof userSchema>

const API_URL = process.env.API_URL ?? 'http://localhost:8000/api/v1'

async function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  const cookieHeader = (await cookies()).toString()
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Accept: 'application/json', Cookie: cookieHeader },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`)
  return schema.parse(await res.json())
}

export function getUser(id: number): Promise<User> {
  return apiGet(`/users/${id}`, userSchema)
}

export async function getDashboard(userId: number) {
  const [user, recent] = await Promise.all([
    getUser(userId),
    apiGet(`/users/${userId}/activity`, z.array(z.object({ id: z.string(), label: z.string() }))),
  ])
  return { user, recent }
}
```

Client-side server state (polling, infinite lists, optimistic UI in the browser) uses TanStack Query (`state-react.md`, `axios.md`). Prefetch on the server and hydrate when the first render needs the data.

## Server Functions (Server Actions)

Functions marked `'use server'` called from forms or Client Components. They are **public HTTP endpoints**: validate input, authenticate and authorize inside every one.

```ts
// @verify next:features/users/users.actions.ts
'use server'
import { updateTag } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'

const renameSchema = z.object({ id: z.coerce.number().int().positive(), fullName: z.string().trim().min(1).max(200) })

export type RenameState = { ok: true } | { ok: false; errors: Record<string, string[]> }

export async function renameUser(_prev: RenameState, formData: FormData): Promise<RenameState> {
  const session = (await cookies()).get('session')?.value
  if (!session) return { ok: false, errors: { form: ['You must be signed in.'] } }

  const parsed = renameSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors }

  const res = await fetch(`${process.env.API_URL}/users/${parsed.data.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: `session=${session}` },
    body: JSON.stringify({ fullName: parsed.data.fullName }),
  })
  if (res.status === 403) return { ok: false, errors: { form: ['Not allowed.'] } }
  if (!res.ok) return { ok: false, errors: { form: ['Could not save. Try again.'] } }

  updateTag(`user-${parsed.data.id}`)
  return { ok: true }
}
```

```tsx
// @verify next:features/users/components/RenameUserForm.tsx
'use client'
import { useActionState } from 'react'
import { type RenameState, renameUser } from '../users.actions'

export function RenameUserForm({ id, fullName }: { id: number; fullName: string }) {
  const [state, action, pending] = useActionState<RenameState, FormData>(renameUser, { ok: true })
  const errors = state.ok ? {} : state.errors

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <label htmlFor="fullName">Full name</label>
      <input id="fullName" name="fullName" defaultValue={fullName} aria-describedby="fullName-error" />
      <p id="fullName-error" role="alert">{errors.fullName?.[0] ?? errors.form?.[0]}</p>
      <button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
    </form>
  )
}
```

## Route Handlers

`app/**/route.ts` for webhooks, BFF endpoints consumed by non-React clients, file streaming, or OAuth callbacks. Do not create a Route Handler only to call it from your own Server Components; call the logic directly.

```ts
// @verify next:app/api/webhooks/payments/route.ts
import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const secret = process.env.PAYMENTS_WEBHOOK_SECRET
  const signature = request.headers.get('x-signature') ?? ''
  const body = await request.text()
  if (!secret) return NextResponse.json({ error: 'Not configured' }, { status: 500 })

  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const valid =
    signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  // enqueue processing; respond fast and idempotently
  return NextResponse.json({ received: true })
}
```

## Request interception: proxy.ts

Next 16 deprecates `middleware.ts` in favor of `proxy.ts` (Node.js runtime by default). Use it for redirects, rewrites, headers and cheap auth gating (presence of a session cookie). Do not fetch data or run heavy logic here: it runs on every matched request.

```ts
// @verify next:proxy.ts
import { type NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has('session')
  if (!hasSession && request.nextUrl.pathname.startsWith('/dashboard')) {
    const login = new URL('/login', request.url)
    login.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(login)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/dashboard/:path*'] }
```

The cookie check is a UX gate. Authorization still happens in the backend and in every Server Function.

## Caching and revalidation (Next 16)

- Opt in with `cacheComponents: true` in `next.config.ts`, then mark cacheable functions, components or pages with `"use cache"`; tune with `cacheLife()` and tag with `cacheTag()`.
- After mutations: `updateTag(tag)` (immediate expiry, for read-your-writes in Server Functions), `revalidateTag(tag, profile)` (background revalidation), `revalidatePath(path)`, `refresh()` (re-render dynamic data without touching the cache).
- Never cache per-user data in a shared cache entry. Values derived from cookies or headers are dynamic.
- On Next 15 projects, keep its model (`fetch` cache options, `revalidate` exports, `unstable_cache`) until the upgrade; do not mix both in one codebase.

## Streaming, loading and error boundaries

- `loading.tsx` per route segment for instant feedback; `<Suspense>` around slow parts so the rest streams first.
- `error.tsx` (Client Component) per segment to isolate failures; `not-found.tsx` with `notFound()`; `global-error.tsx` as last resort.
- Parallel routes need a `default.tsx` for unmatched slots.

## Metadata, SEO, images, fonts

- `export const metadata` or `generateMetadata()` per route; `sitemap.ts`, `robots.ts`, Open Graph images with `opengraph-image.tsx`.
- `next/image` with explicit `width`/`height` or `fill` + `sizes`; `priority` only for the LCP image. Configure `images.remotePatterns` narrowly.
- `next/font` for self-hosted fonts with no layout shift.

## Authentication

Session in an `HttpOnly`, `Secure`, `SameSite` cookie, issued by the backend or an auth library (Auth.js, Better Auth, or the identity provider's SDK). Read it on the server with `cookies()`. Check authorization in Server Components that render protected data, in every Server Function, and in Route Handlers, not only in `proxy.ts`.

## Pitfalls

- `'use client'` at the top of a page or layout "to make it work": the whole subtree ships as JavaScript.
- Fetching your own Route Handler from a Server Component.
- Secrets in `NEXT_PUBLIC_*` variables: they are inlined into the client bundle.
- Module-level variables holding request or user data on the server.
- Sequential awaits for independent requests (waterfalls).
- Using Axios in Server Components and losing request deduplication.
- Assuming Module Federation works with the App Router: `@module-federation/nextjs-mf` supports Pages Router only, peers Next ≤ 15, and is heading to end of life (see `microfrontends.md`).
