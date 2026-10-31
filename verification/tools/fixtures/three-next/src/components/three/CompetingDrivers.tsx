'use client'
import { useFrame } from '@react-three/fiber'
import gsap from 'gsap'
import { useEffect, useRef } from 'react'
import type * as THREE from 'three'

/** GSAP tweens the group's rotation while useFrame also increments it. */
export function CompetingDrivers() {
  const group = useRef<THREE.Group>(null)
  useEffect(() => {
    if (!group.current) return
    const tween = gsap.to(group.current.rotation, { y: Math.PI, duration: 3 })
    return () => {
      tween.kill()
    }
  }, [])
  useFrame((_state, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.2
  })
  return (
    <group ref={group}>
      <mesh>
        <boxGeometry />
        <meshNormalMaterial />
      </mesh>
    </group>
  )
}
