'use client'
import { useEffect, useRef, useState } from 'react'

export function AssetsLab() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    let lab: { dispose: () => void } | null = null
    let cancelled = false
    const run = async () => {
      if (!canvas.current) return
      const { mountAssetsLab } = await import('@/lib/lab/labs/assets-lab')
      if (cancelled) return
      lab = await mountAssetsLab(canvas.current)
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
      <canvas ref={canvas} style={{ display: 'block', width: '100%', maxWidth: 640, aspectRatio: '16 / 9', background: '#111218' }} aria-label="GLTF fixtures loaded through the asset cache" />
    </>
  )
}
