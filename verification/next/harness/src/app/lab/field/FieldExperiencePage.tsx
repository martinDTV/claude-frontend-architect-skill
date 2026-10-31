'use client'
import { useEffect, useRef, useState } from 'react'
import styles from '../lab.module.css'

/** Reference experience B in React. */
export function FieldExperiencePage() {
  const container = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const controls = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('loading')
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    // effect runs and cleanups, for the Strict Mode check: development runs this twice, the cancel flag below keeps one experience
    const effects = ((window as unknown as { __labEffects?: { runs: number; cleanups: number } }).__labEffects ??= { runs: 0, cleanups: 0 })
    effects.runs++
    let dispose: (() => void) | null = null
    let cancelled = false
    const run = async () => {
      try {
      if (!container.current || !canvas.current || !controls.current) return
      const { mountFieldPage } = await import('@/lib/lab/labs/pages')
      if (cancelled) return
      dispose = await mountFieldPage({ container: container.current, canvas: canvas.current, controls: controls.current, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches })
      if (cancelled) dispose()
      else setStatus('ready')
      } catch (error) {
        // no WebGL context: the DOM alternative; anything else: the error, named
        if (cancelled) return
        const e = error as Error
        setStatus(e.name === 'WebGLUnavailable' ? 'unsupported' : 'error')
        setProblem(e.message)
      }
    }
    void run()
    return () => {
      effects.cleanups++
      cancelled = true
      dispose?.()
      dispose = null
    }
  }, [])
  return (
    <main>
      <h1 className={styles.srOnly}>GPU particle experience</h1>
      <p data-status>{status}</p>
      {problem && <p role="alert" data-problem className={styles.problem}>{status === 'unsupported' ? 'This browser cannot show the 3D scene. The chapters are listed below.' : `The scene could not be loaded: ${problem}`}</p>}
      <div ref={container} className={status === 'unsupported' ? styles.fallback : undefined} style={{ height: '300vh' }}>
        <div className={styles.pin}>
          <div ref={controls} className={styles.stage} aria-hidden="true">
            <canvas ref={canvas} className={styles.canvas} />
          </div>
          <p className={styles.caption} data-caption="field">Sixteen thousand particles find a sphere, scatter, and settle on the emblem as you scroll. Move the pointer through them.</p>
          <label className={styles.controls}>Density <input type="range" data-density min="2" max="100" defaultValue="35" /></label>
        </div>
      </div>
    </main>
  )
}
