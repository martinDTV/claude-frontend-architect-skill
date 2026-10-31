'use client'
import { useRef } from 'react'
import * as THREE from 'three'

/** A renderer created in the render body: once per render, and on the server when the component is server-rendered. */
export function RenderBodyRenderer() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = new THREE.WebGLRenderer()
  const scene = new THREE.Scene()
  void scene
  void renderer
  return <canvas ref={canvas} aria-hidden="true" />
}
