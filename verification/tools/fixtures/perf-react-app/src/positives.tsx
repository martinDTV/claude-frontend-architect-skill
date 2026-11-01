'use client'
import { createContext, useState } from 'react'
import moment from 'moment'
import * as THREE from 'three'
const Ctx = createContext<unknown>(null)
export function Positives({ items }: { items: { id: string; label: string }[] }) {
  const [n] = useState(0)
  const scene = new THREE.Scene()
  return (
    <Ctx.Provider value={{ n, when: moment() }}>
      <ul>
        {items.map((it, index) => <li key={index}>{it.label}</li>)}
      </ul>
      <ol>
        {items.map((it) => <li key={Math.random()}>{it.label}</li>)}
      </ol>
      <span data-scene={scene.uuid} />
    </Ctx.Provider>
  )
}
