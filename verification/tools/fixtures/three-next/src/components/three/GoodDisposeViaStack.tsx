'use client'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { createCleanupStack } from '@/lib/lifecycle/cleanup-stack'

/** Resources tracked by a cleanup stack that the effect cleanup disposes. */
export function GoodDisposeViaStack() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const stack = createCleanupStack()
    const renderer = stack.track(new THREE.WebGLRenderer({ canvas: el }))
    stack.listen(el, 'webglcontextlost', (event) => event.preventDefault())
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const geometry = stack.track(new THREE.PlaneGeometry(2, 2))
    const material = stack.track(new THREE.MeshBasicMaterial())
    scene.add(new THREE.Mesh(geometry, material))
    renderer.setAnimationLoop(() => renderer.render(scene, camera))
    stack.add(() => renderer.setAnimationLoop(null))
    return () => stack.dispose()
  }, [])
  return <canvas ref={canvas} aria-hidden="true" />
}
