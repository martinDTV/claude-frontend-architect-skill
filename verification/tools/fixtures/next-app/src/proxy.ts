import { type NextRequest, NextResponse } from 'next/server'
export function proxy(request: NextRequest) {
  if (!request.cookies.has('session') && request.nextUrl.pathname.startsWith('/dashboard')) return NextResponse.redirect(new URL('/login', request.url))
  return NextResponse.next()
}
export const config = { matcher: ['/dashboard/:path*'] }
