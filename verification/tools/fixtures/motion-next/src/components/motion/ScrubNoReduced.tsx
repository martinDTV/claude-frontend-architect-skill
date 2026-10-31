'use client'
import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

// cleaned up by useGSAP, but a scrubbed, pinned story with no reduced-motion alternative
export function ScrubNoReduced() {
  const root = useRef<HTMLElement>(null)
  useGSAP(() => {
    gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top top', end: '+=2000', scrub: 1, pin: true } }).to('.scene', { xPercent: -200 })
  }, { scope: root })
  return <section ref={root}><div className="scene">Scene</div></section>
}
