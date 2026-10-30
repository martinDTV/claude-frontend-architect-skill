'use client'
import { useEffect, useState } from 'react'
export function WindowInEffect() {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    setWidth(window.innerWidth)
  }, [])
  return <small>{width}px</small>
}
