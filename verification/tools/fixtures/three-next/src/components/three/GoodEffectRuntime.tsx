'use client'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/** Created in the effect, every resource disposed and the loop stopped in the cleanup; context loss handled. */
export function GoodEffectRuntime() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const onLost = (event: Event) => {
      event.preventDefault()
      renderer.setAnimationLoop(null)
    }
    el.addEventListener('webglcontextlost', onLost)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.z = 4
    const geometry = new THREE.BoxGeometry()
    const material = new THREE.MeshStandardMaterial({ color: '#22d3ee' })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh, new THREE.DirectionalLight(0xffffff, 2))
    renderer.setAnimationLoop((time) => {
      mesh.rotation.x = time * 0.0004
      renderer.render(scene, camera)
    })
    return () => {
      el.removeEventListener('webglcontextlost', onLost)
      renderer.setAnimationLoop(null)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    }
  }, [])
  return <canvas ref={canvas} aria-hidden="true" />
}
