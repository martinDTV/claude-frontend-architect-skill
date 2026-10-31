'use client'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/** Declarative R3F: the framework owns geometry and material; the frame callback writes transforms and reuses a vector. */
export function GoodR3F() {
  const ref = useRef<THREE.Mesh>(null)
  const axis = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  useFrame((_state, delta) => {
    if (!ref.current) return
    ref.current.rotation.y += delta * 0.6
    ref.current.rotateOnAxis(axis, delta * 0.1)
  })
  return (
    <mesh ref={ref}>
      <torusKnotGeometry args={[1, 0.3, 128, 16]} />
      <meshPhysicalMaterial color="#f472b6" clearcoat={1} />
    </mesh>
  )
}
