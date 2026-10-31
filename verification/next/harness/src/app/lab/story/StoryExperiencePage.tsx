'use client'
import { useEffect, useRef, useState } from 'react'
import styles from '../lab.module.css'

const chapters = [
  { id: 'arrival', title: 'Arrival', text: 'Monoliths in a field at dawn; the path leads inward.' },
  { id: 'hall', title: 'The hall', text: 'Pillars of light stand in a ring; the floor gives way.' },
  { id: 'artefact', title: 'The artefact', text: 'What was kept here, turning slowly in its dust.' },
]

/** Reference experience C in React. */
export function StoryExperiencePage() {
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
      const { mountStoryPage } = await import('@/lib/lab/labs/pages')
      if (cancelled) return
      dispose = await mountStoryPage({ container: container.current, canvas: canvas.current, controls: controls.current, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, onCaption: (id, on) => setActive((a) => ({ ...a, [id]: on })) })
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
      <h1 className={styles.srOnly}>Immersive story</h1>
      <p data-status>{status}</p>
      {problem && <p role="alert" data-problem className={styles.problem}>{status === 'unsupported' ? 'This browser cannot show the 3D scene. The chapters are listed below.' : `The scene could not be loaded: ${problem}`}</p>}
      <div ref={container} className={status === 'unsupported' ? `${styles.story} ${styles.fallback}` : styles.story} style={{ height: '500vh' }} tabIndex={0} role="group" aria-label="Story. Arrow keys, Page Up and Page Down move between chapters.">
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
              <li key={c.id} data-caption={c.id} data-active={active[c.id] ? 'true' : 'false'}>
                <h2>{c.title}</h2>
                <p>{c.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </main>
  )
}
