'use client'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/** A requestAnimationFrame loop started in an effect that returns no cleanup: it outlives the component. */
export function EffectNoCleanupLoop() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ canvas: el })
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()))
    const tick = () => {
      requestAnimationFrame(tick)
      renderer.render(scene, camera)
    }
    tick()
  }, [])
  return <canvas ref={canvas} aria-hidden="true" />
}
