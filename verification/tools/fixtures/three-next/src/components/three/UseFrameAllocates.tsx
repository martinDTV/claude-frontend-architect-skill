'use client'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

/** A new material every frame inside useFrame: R3F does not dispose what the callback allocates. */
export function UseFrameAllocates() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!ref.current) return
    ref.current.material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(state.clock.elapsedTime % 1, 0.6, 0.5) })
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1, 32, 16]} />
      <meshStandardMaterial />
    </mesh>
  )
}
