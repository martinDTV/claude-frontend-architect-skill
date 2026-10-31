'use client'
import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

// useGSAP reverts every tween and ScrollTrigger on unmount and survives Strict Mode double effects
export function GoodUseGSAP() {
  const root = useRef<HTMLElement>(null)
  useGSAP(() => {
    gsap.matchMedia().add({ reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' }, (ctx) => {
      const { reduce } = ctx.conditions as { reduce: boolean }
      if (reduce) return gsap.set('.step', { opacity: 1, y: 0 })
      gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 80%', scrub: true } }).from('.step', { y: 32, opacity: 0, stagger: 0.15 })
    })
  }, { scope: root })
  return <section ref={root}><p className="step">One</p><p className="step">Two</p></section>
}
