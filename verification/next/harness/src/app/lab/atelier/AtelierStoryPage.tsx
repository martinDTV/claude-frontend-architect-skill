'use client'
import { useEffect, useRef, useState } from 'react'
import styles from '../lab.module.css'

const chapters = [
  { id: 'hero', title: 'Atelier', text: 'A small speaker, turned and lacquered, lit the way the room lights it.' },
  { id: 'exploded', title: 'Every part', text: 'Base, body, grille, plate, knob: each one made to be seen on its own.' },
  { id: 'dust', title: 'Made of light', text: 'The parts dissolve into dust that remembers their shape, and settles back.' },
  { id: 'choose', title: 'Yours', text: 'Three finishes, two grilles. Turn it, pick a part, make it yours.' },
]

/** Reference experience D in React: the product story on an imported GLB. */
export function AtelierStoryPage() {
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
      const { mountAtelierPage } = await import('@/lib/lab/labs/pages')
      if (cancelled) return
      dispose = await mountAtelierPage({ container: container.current, canvas: canvas.current, controls: controls.current, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, onCaption: (id, on) => setActive((a) => ({ ...a, [id]: on })) })
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
      <h1 className={styles.srOnly}>Atelier: the product story</h1>
      <p data-status>{status}</p>
      {problem && <p role="alert" data-problem className={styles.problem}>{status === 'unsupported' ? 'This browser cannot show the 3D scene. The chapters are listed below.' : `The scene could not be loaded: ${problem}`}</p>}
      <div ref={container} className={status === 'unsupported' ? `${styles.story} ${styles.fallback}` : styles.story} style={{ height: '500vh' }} tabIndex={0} role="group" aria-label="Product story. Arrow keys, Page Up and Page Down move between chapters; in explore mode the arrows orbit.">
        <div className={styles.pin} data-focus-ring>
          <div ref={controls} className={styles.stage}>
            <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
          </div>
          <nav className={styles.chapters} aria-label="Chapters">
            {chapters.map((c) => (
              <button key={c.id} type="button" data-chapter={c.id}>{c.title}</button>
            ))}
            <p data-live aria-live="polite" className={styles.srOnly} />
          </nav>
          <ol className={styles.captions}>
            {chapters.map((c) => (
              <li key={c.id} data-caption={c.id} data-active={active[c.id] ? 'true' : 'false'} aria-current={active[c.id] ? 'step' : undefined}>
                <h2>{c.title}</h2>
                <p>{c.text}</p>
              </li>
            ))}
          </ol>
          <form className={styles.controls} aria-label="Configure the speaker" onSubmit={(e) => e.preventDefault()}>
            <label>Finish <select data-option="finish" defaultValue="" /></label>
            <label>Grille <select data-option="grille" defaultValue="" /></label>
            <label>Part <select data-part defaultValue="" /></label>
            <button type="button" data-explore aria-pressed="false">Explore</button>
            <span data-selected>Nothing selected</span>
          </form>
        </div>
      </div>
    </main>
  )
}
