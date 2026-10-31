import type { ReactNode } from 'react'
import Link from 'next/link'
import { HttpProvider } from '@/providers/http-provider'
import { QueryProvider } from '@/providers/query-provider'

export const metadata = { title: 'verification' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav aria-label="Primary">
          <Link href="/">Home</Link> <Link href="/users">Users</Link> <Link href="/motion">Motion</Link> <Link href="/motion/other">Second</Link> <Link href="/lab/shaders">Shader lab</Link> <Link href="/lab/particles">Particle lab</Link> <Link href="/lab/product">Product</Link> <Link href="/lab/field">Field</Link> <Link href="/lab/story">Story</Link>
        </nav>
        <QueryProvider>
          <HttpProvider baseURL="/api/v1">{children}</HttpProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
