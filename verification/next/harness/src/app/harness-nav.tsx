'use client'
// The harness navigation: every verification page except the enterprise application, which owns the viewport with
// its own shell (app/app/layout.tsx).
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function HarnessNav() {
  const pathname = usePathname()
  // the enterprise app and the launch page own their frame
  if (['/app', '/landing'].some((base) => pathname === base || pathname.startsWith(`${base}/`))) return null
  return (
    <nav aria-label="Primary" className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-sm [&>a]:inline-block [&>a]:py-1.5">
      <Link href="/">Home</Link> <Link href="/users">Users</Link> <Link href="/motion">Motion</Link> <Link href="/motion/other">Second</Link> <Link href="/design">Design</Link> <Link href="/app">Atlas app</Link> <Link href="/landing">Lumen landing</Link> <Link href="/lab/shaders">Shader lab</Link> <Link href="/lab/particles">Particle lab</Link> <Link href="/lab/product">Product</Link> <Link href="/lab/field">Field</Link> <Link href="/lab/story">Story</Link> <Link href="/lab/assets">Assets</Link> <Link href="/lab/atelier-r3f">Atelier R3F</Link> <Link href="/lab/atelier">Atelier</Link>
    </nav>
  )
}
