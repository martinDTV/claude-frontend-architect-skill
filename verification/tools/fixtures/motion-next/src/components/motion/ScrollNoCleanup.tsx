'use client'
import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// the effect has a cleanup, but it only removes a listener: the ScrollTrigger is never killed
export function ScrollNoCleanup() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onResize = () => ScrollTrigger.refresh()
    window.addEventListener('resize', onResize)
    ScrollTrigger.create({ trigger: root.current, start: 'top center', onEnter: () => root.current?.classList.add('in') })
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return <div ref={root}>Reveal</div>
}
