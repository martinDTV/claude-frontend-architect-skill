'use client'
import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

// animation created in an event handler through contextSafe: tracked by the hook's context
export function HandlerTween() {
  const root = useRef<HTMLDivElement>(null)
  const { contextSafe } = useGSAP({ scope: root })
  const onToggle = contextSafe(() => {
    gsap.to('.pane', { height: 'auto', duration: 0.3 })
  })
  return <div ref={root}><button type="button" onClick={onToggle}>Toggle</button><div className="pane" /></div>
}
