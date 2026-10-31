'use client'
import { useEffect, useRef, useState } from 'react'

/** Mounts the shader lab in an effect (client only, lazy module), disposes in the cleanup: Strict Mode runs both twice. */
export function ShadersLab() {
  const gl = useRef<HTMLCanvasElement>(null)
  const tsl = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    let lab: { dispose: () => void } | null = null
    let cancelled = false
    const run = async () => {
      if (!gl.current || !tsl.current) return
      const { mountShaderLab } = await import('@/lib/lab/labs/shaders-lab')
      if (cancelled) return
      lab = await mountShaderLab(gl.current, tsl.current)
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
      <canvas ref={gl} style={{ display: 'block', width: '100%', maxWidth: 640, aspectRatio: '16 / 9', background: '#0b0b12' }} aria-label="GLSL materials and post-processing" />
      <canvas ref={tsl} style={{ display: 'block', width: 256, height: 256, marginTop: '1rem', background: '#0b0b12' }} aria-label="TSL node materials on the WebGL 2 backend" />
    </>
  )
}
