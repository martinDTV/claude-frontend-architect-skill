'use client'
import gsap from 'gsap'

// a tween in the render body: runs on every render and, with SSR, on the server
export function RenderBodyTween({ open }: { open: boolean }) {
  gsap.to('.drawer', { x: open ? 0 : -320 })
  return <aside className="drawer">Menu</aside>
}
