import type { ReactNode } from 'react'
import './globals.css'
import { THEME_BOOT_SCRIPT } from './design/theme-toggle'
import { HarnessNav } from './harness-nav'
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
        <HarnessNav />
        <QueryProvider>
          <HttpProvider baseURL="/api/v1">{children}</HttpProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
