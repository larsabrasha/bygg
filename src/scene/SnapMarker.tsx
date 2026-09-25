import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { Vec3 } from '../model/types'
import { SNAP_GRID, SNAP_ON_TARGET } from './colors'

/** Punkt med fast storlek i pixlar, alltid synlig ovanpå geometrin. */
export function SnapMarker({ position, onTarget }: { position: Vec3; onTarget: boolean }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
    return g
  }, [])
  return (
    <points position={position} geometry={geometry} renderOrder={10}>
      <pointsMaterial
        color={onTarget ? SNAP_ON_TARGET : SNAP_GRID}
        size={onTarget ? 11 : 7}
        sizeAttenuation={false}
        depthTest={false}
      />
    </points>
  )
}
