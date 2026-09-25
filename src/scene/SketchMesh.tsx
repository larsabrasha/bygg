import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import { DoubleSide } from 'three'
import type { Frame, Rect, Shape } from '../model/types'
import { ACCENT } from './colors'
import { CYLINDER_SEGMENTS as SEGMENTS } from './cylinder'
import { frameQuaternion } from './frameTransform'

interface Props {
  frame: Frame
  rect: Rect
  /** Cirkel inskriven i rect. */
  shape?: Shape
  /** Sätts för sparade skisser så att de går att träffa. Utelämnas för förhandsvisning. */
  pickId?: string
  emphasis?: 'none' | 'hover' | 'selected'
}

/** Lyfter skissen en aning ut ur planet så att den syns ovanpå ytan den ligger på. */
const LIFT = 0.3

export function SketchMesh({ frame, rect, shape, pickId, emphasis = 'none' }: Props) {
  const quaternion = useMemo(() => frameQuaternion(frame), [frame])
  const { x0, y0, x1, y1 } = rect
  const round = shape === 'circle'
  const outline = useMemo((): [number, number, number][] => {
    if (!round)
      return [
        [x0, y0, LIFT],
        [x1, y0, LIFT],
        [x1, y1, LIFT],
        [x0, y1, LIFT],
        [x0, y0, LIFT],
      ]
    const [cx, cy, r] = [(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2]
    return Array.from({ length: SEGMENTS + 1 }, (_, i) => {
      const a = (i / SEGMENTS) * 2 * Math.PI
      return [cx + r * Math.cos(a), cy + r * Math.sin(a), LIFT]
    })
  }, [round, x0, y0, x1, y1])
  const opacity = emphasis === 'none' ? 0.18 : 0.35

  return (
    <group position={frame.origin} quaternion={quaternion}>
      <mesh
        position={[(x0 + x1) / 2, (y0 + y1) / 2, LIFT]}
        userData={pickId ? { pick: { kind: 'sketch', id: pickId } } : {}}
      >
        {round ? <circleGeometry args={[(x1 - x0) / 2, SEGMENTS]} /> : <planeGeometry args={[x1 - x0, y1 - y0]} />}
        <meshBasicMaterial
          color={ACCENT}
          transparent
          opacity={opacity}
          side={DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
      <Line points={outline} color={ACCENT} lineWidth={emphasis === 'selected' ? 2.5 : 1.5} />
    </group>
  )
}
