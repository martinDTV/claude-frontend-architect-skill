import type { ReactNode } from 'react'
import { HttpProvider } from '@/providers/http-provider'
import { QueryProvider } from '@/providers/query-provider'

export const metadata = { title: 'verification' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <HttpProvider baseURL="/api/v1">{children}</HttpProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
