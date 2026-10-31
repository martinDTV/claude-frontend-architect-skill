'use client'
import { useEffect, useRef } from 'react'
import gsap from 'gsap'

// the effect never returns a cleanup: the tween survives unmount and Strict Mode creates it twice
export function EffectNoCleanup() {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    gsap.to(box.current, { rotation: 360, duration: 2 })
  }, [])
  return <div ref={box} className="box" />
}
