'use client'
import { useEffect, useRef } from 'react'
import gsap from 'gsap'

// a plain effect is fine when its cleanup reverts the context
export function GoodEffectRevert() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.row', { x: -12, opacity: 0, stagger: 0.05 })
    }, root)
    return () => ctx.revert()
  }, [])
  return <div ref={root}><span className="row">a</span><span className="row">b</span></div>
}
