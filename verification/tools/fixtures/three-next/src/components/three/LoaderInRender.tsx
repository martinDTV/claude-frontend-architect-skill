'use client'
import { useState } from 'react'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** A model requested from the render body: a new request on every render, and on the server. */
export function LoaderInRender() {
  const [count, setCount] = useState(0)
  new GLTFLoader().load('/models/chair.glb', () => setCount((c) => c + 1))
  return <p>{count}</p>
}
