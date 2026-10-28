'use client'
import { useEffect, useState } from 'react'
export function OrderFilters() {
  const [w, setW] = useState(0)
  useEffect(() => {
    const onResize = () => setW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return <span>{w}</span>
}
