'use client'
import { useEffect, useRef, useState } from 'react'
import styles from '../lab.module.css'

/** Reference experience B in React. */
export function FieldExperiencePage() {
  const container = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const controls = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    let dispose: (() => void) | null = null
    let cancelled = false
    const run = async () => {
      if (!container.current || !canvas.current || !controls.current) return
      const { mountFieldPage } = await import('@/lib/lab/labs/pages')
      if (cancelled) return
      dispose = await mountFieldPage({ container: container.current, canvas: canvas.current, controls: controls.current, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches })
      if (cancelled) dispose()
      else setStatus('ready')
    }
    void run()
    return () => {
      cancelled = true
      dispose?.()
      dispose = null
    }
  }, [])
  return (
    <main>
      <h1 className={styles.srOnly}>GPU particle experience</h1>
      <p data-status>{status}</p>
      <div ref={container} style={{ height: '300vh' }}>
        <div className={styles.pin}>
          <div ref={controls} className={styles.stage} aria-hidden="true">
            <canvas ref={canvas} className={styles.canvas} />
          </div>
          <p className={styles.caption}>Sixteen thousand particles find a sphere, scatter, and settle on the emblem as you scroll. Move the pointer through them.</p>
          <label className={styles.controls}>Density <input type="range" data-density min="2" max="100" defaultValue="35" /></label>
        </div>
      </div>
    </main>
  )
}
