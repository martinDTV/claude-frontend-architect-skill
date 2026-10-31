'use client'
import { useEffect, useRef, useState } from 'react'
import styles from '../lab.module.css'

const captions = [
  { id: 'establishing', title: 'Eau de verre', text: 'A bottle of clear glass, a liquid of amber, a cap of brushed steel.' },
  { id: 'cap', title: 'The cap', text: 'Turned from one piece, lacquered collar, no seam.' },
  { id: 'low', title: 'From below', text: 'The liquid holds the light the way the room gives it.' },
  { id: 'reverse', title: 'Choose yours', text: 'Three colours, two finishes, one bottle.' },
]

/** Reference experience A in React: created in an effect (Strict Mode creates and disposes it twice), disposed in the cleanup. */
export function ProductExperiencePage() {
  const container = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const controls = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('loading')
  const [problem, setProblem] = useState<string | null>(null)
  const [active, setActive] = useState<Record<string, boolean>>({})
  useEffect(() => {
    // effect runs and cleanups, for the Strict Mode check: development runs this twice, the cancel flag below keeps one experience
    const effects = ((window as unknown as { __labEffects?: { runs: number; cleanups: number } }).__labEffects ??= { runs: 0, cleanups: 0 })
    effects.runs++
    let dispose: (() => void) | null = null
    let cancelled = false
    const run = async () => {
      try {
      if (!container.current || !canvas.current || !controls.current) return
      const { mountProductPage } = await import('@/lib/lab/labs/pages')
      if (cancelled) return
      dispose = await mountProductPage({ container: container.current, canvas: canvas.current, controls: controls.current, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, onCaption: (id, on) => setActive((a) => ({ ...a, [id]: on })) })
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
      <h1 className={styles.srOnly}>Cinematic product experience</h1>
      <p data-status>{status}</p>
      {problem && <p role="alert" data-problem className={styles.problem}>{status === 'unsupported' ? 'This browser cannot show the 3D scene. The chapters are listed below.' : `The scene could not be loaded: ${problem}`}</p>}
      <div ref={container} className={status === 'unsupported' ? styles.fallback : undefined} style={{ height: '400vh' }}>
        <div className={styles.pin}>
          <div ref={controls} className={styles.stage} data-focus-ring tabIndex={0} role="group" aria-label="Product viewer. In explore mode the arrow keys orbit the camera.">
            <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
          </div>
          <ol className={styles.captions} aria-label="Chapters">
            {captions.map((c) => (
              <li key={c.id} data-caption={c.id} data-active={active[c.id] ? 'true' : 'false'} aria-current={active[c.id] ? 'step' : undefined}>
                <h2>{c.title}</h2>
                <p>{c.text}</p>
              </li>
            ))}
          </ol>
          <form className={styles.controls} aria-label="Configure the bottle" onSubmit={(e) => e.preventDefault()}>
            <label>Finish <select data-option="finish" defaultValue="" /></label>
            <label>Colour <select data-option="color" defaultValue="" /></label>
            <button type="button" data-explore aria-pressed="false">Explore</button>
            <button type="button" data-seek="0">Start</button>
            <button type="button" data-seek="1">End</button>
          </form>
        </div>
      </div>
    </main>
  )
}
