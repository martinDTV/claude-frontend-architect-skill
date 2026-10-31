'use client'
import { useEffect, useRef, useState } from 'react'

export function ParticlesLab() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    let lab: { dispose: () => void } | null = null
    let cancelled = false
    const run = async () => {
      if (!canvas.current) return
      const { mountParticlesLab } = await import('@/lib/lab/labs/particles-lab')
      if (cancelled) return
      lab = await mountParticlesLab(canvas.current)
      if (cancelled) lab.dispose()
      else setStatus('ready')
    }
    void run()
    return () => {
      cancelled = true
      lab?.dispose()
      lab = null
    }
  }, [])
  return (
    <>
      <p data-status>{status}</p>
      <canvas ref={canvas} style={{ display: 'block', width: '100%', maxWidth: 640, aspectRatio: '16 / 9', background: '#07070d' }} aria-label="GPU particle simulation" />
    </>
  )
}
