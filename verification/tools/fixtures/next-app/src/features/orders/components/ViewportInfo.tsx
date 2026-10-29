'use client'
import { readViewport } from '../browser'
// a Client Component may use client-only code: no finding expected
export function ViewportInfo() {
  const vp = readViewport()
  return <small>{vp.width}</small>
}
