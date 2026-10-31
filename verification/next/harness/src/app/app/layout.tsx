import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { AppShell } from '@/features/atlas/app-shell'

export const metadata = { title: { template: '%s · Atlas', default: 'Atlas Logistics' } }
// rendered per request: the search params (api mode, table state) are read during the server render, so the HTML the
// browser receives is the shell with its data region, not a static fallback
export const dynamic = 'force-dynamic'

// The enterprise shell: everything under /app shares the sidebar, the search palette, the toasts and the providers.
// useSearchParams in the providers needs a Suspense boundary for static rendering.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  )
}
