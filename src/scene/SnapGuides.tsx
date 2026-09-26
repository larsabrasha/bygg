import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { toWorld } from '../model/frame'
import { rectMidpoints } from '../model/snapping'
import type { Frame, Rect, Vec3 } from '../model/types'
import { SNAP_GRID, SNAP_ON_TARGET } from './colors'

function pointsGeometry(points: readonly Vec3[]): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(points.flat(), 3))
  return g
}

interface Props {
  /** Ytan vars kantmitter och mitt visas, i frame-koordinater. Null: inga prickar. */
  face: { frame: Frame; bounds: Rect | null } | null
  /** Hur långt ytan har flyttats (Flytta), i världen. */
  offset?: Vec3
  /** Hjälplinjer i världen, från målpunkten till det som snäppte (se alignedGuides). */
  guides: [Vec3, Vec3][]
}

/**
 * Det man kan snäppa till: prickar på kantmitterna och mitten av ytan man
 * ritar på eller flyttar, och streckade hjälplinjer från det man ligger i
 * linje med, med en prick där de börjar. Ritas ovanpå geometrin, som snäppmarkören.
 */
export function SnapGuides({ face, offset = [0, 0, 0], guides }: Props) {
  const frame = face?.frame
  const bounds = face?.bounds
  const mids = useMemo(
    () => (frame && bounds ? pointsGeometry(rectMidpoints(bounds).map(([x, y]) => toWorld(frame, [x, y, 0]))) : null),
    [frame, bounds],
  )
  const starts = useMemo(() => (guides.length ? pointsGeometry(guides.map(([a]) => a)) : null), [guides])
  return (
    <>
      {mids && (
        <points geometry={mids} position={offset} renderOrder={9}>
          <pointsMaterial color={SNAP_GRID} size={6} sizeAttenuation={false} depthTest={false} />
        </points>
      )}
      {guides.map(([a, b], i) => (
        <Line
          key={i}
          points={[a, b]}
          color={SNAP_ON_TARGET}
          lineWidth={1}
          dashed
          dashSize={20}
          gapSize={12}
          depthTest={false}
          renderOrder={9}
        />
      ))}
      {starts && (
        <points geometry={starts} renderOrder={10}>
          <pointsMaterial color={SNAP_ON_TARGET} size={7} sizeAttenuation={false} depthTest={false} />
        </points>
      )}
    </>
  )
}
