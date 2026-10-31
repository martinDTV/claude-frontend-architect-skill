import type { ReactNode } from 'react'
import './globals.css'
import { THEME_BOOT_SCRIPT } from './design/theme-toggle'
import Link from 'next/link'
import { HttpProvider } from '@/providers/http-provider'
import { QueryProvider } from '@/providers/query-provider'

export const metadata = { title: 'verification' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* the stored or system theme before the first paint: the class the tokens answer to */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <nav aria-label="Primary" className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2 text-sm">
          <Link href="/">Home</Link> <Link href="/users">Users</Link> <Link href="/motion">Motion</Link> <Link href="/motion/other">Second</Link> <Link href="/design">Design</Link> <Link href="/lab/shaders">Shader lab</Link> <Link href="/lab/particles">Particle lab</Link> <Link href="/lab/product">Product</Link> <Link href="/lab/field">Field</Link> <Link href="/lab/story">Story</Link> <Link href="/lab/assets">Assets</Link> <Link href="/lab/atelier-r3f">Atelier R3F</Link> <Link href="/lab/atelier">Atelier</Link>
        </nav>
        <QueryProvider>
          <HttpProvider baseURL="/api/v1">{children}</HttpProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
