'use client'
import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

// no dependency array and no cleanup: a new timeline on every render
export function EffectNoDeps() {
  const list = useRef<HTMLUListElement>(null)
  const [count, setCount] = useState(0)
  useEffect(() => {
    gsap.timeline().from(list.current, { opacity: 0 })
  })
  return <ul ref={list} onClick={() => setCount(count + 1)}><li>{count}</li></ul>
}
