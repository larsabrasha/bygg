import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import { Vector3 } from 'three'
import { toWorld } from '../model/frame'
import { rectFromCorners } from '../model/geometry'
import { add, scale } from '../model/vec'
import type { HoverPoint, Op, PushPullOp, RotateOp } from '../store/toolStore'
import { ACCENT, AXIS_COLORS } from './colors'
import { SketchMesh } from './SketchMesh'
import { SnapMarker } from './SnapMarker'

/** Halva längden på hjälplinjen längs axeln, i mm. */
const GUIDE = 20000

/** Pil längs normalen, som visar åt vilket håll push/pull drar. */
function Arrow({ op }: { op: PushPullOp }) {
  const dir = useMemo(() => new Vector3(...op.normal), [op.normal])
  const tip = add(op.anchor, scale(op.normal, op.distance))
  // ArrowHelper läser riktningen bara när den skapas, därav key.
  return <arrowHelper key={op.normal.join()} args={[dir, new Vector3(), 160, ACCENT, 50, 30]} position={tip} />
}

/** Det som ritas ovanpå förhandsdokumentet: rektangel, pil och snäppmarkör. */
export function OpOverlay({ op }: { op: Op }) {
  if (op.kind === 'rect') {
    const r = rectFromCorners(op.first, op.current)
    const at = toWorld(op.frame, [op.current[0], op.current[1], 0])
    return (
      <>
        {(r.x1 > r.x0 || r.y1 > r.y0) && <SketchMesh frame={op.frame} rect={r} emphasis="selected" />}
        <SnapMarker position={at} onTarget={op.onTarget[0] || op.onTarget[1]} />
      </>
    )
  }
  if (op.kind === 'pushpull') {
    return (
      <>
        <Arrow op={op} />
        {op.onTarget && <SnapMarker position={add(op.anchor, scale(op.normal, op.distance))} onTarget />}
      </>
    )
  }
  if (op.kind === 'rotate') return <RotateGuide op={op} />
  const at = add(op.plane.origin, add(scale(op.plane.u, op.delta[0]), scale(op.plane.v, op.delta[1])))
  return (
    <>
      {/* Längs en pil: en linje i axelns färg visar att delen bara kan gå åt det hållet. */}
      {op.axis !== null && (
        <Line
          points={[add(at, scale(op.plane.u, -GUIDE)), add(at, scale(op.plane.u, GUIDE))]}
          color={AXIS_COLORS[op.axis]}
          lineWidth={1.5}
        />
      )}
      <SnapMarker position={at} onTarget={op.onTarget[0] || op.onTarget[1]} />
    </>
  )
}

/** Cirkel i vridplanet, och ekrar från mitten till där man tog tag och dit man vridit. */
function RotateGuide({ op }: { op: RotateOp }) {
  const at = (deg: number, r = op.radius) => {
    const a = (deg * Math.PI) / 180
    return toWorld(op.plane, [r * Math.cos(a), r * Math.sin(a), 0])
  }
  const circle = useMemo(
    () =>
      Array.from({ length: 65 }, (_, i) =>
        toWorld(op.plane, [op.radius * Math.cos((i / 32) * Math.PI), op.radius * Math.sin((i / 32) * Math.PI), 0]),
      ),
    [op.plane, op.radius],
  )
  const color = AXIS_COLORS[op.axis]
  return (
    <>
      <Line points={circle} color={color} lineWidth={1.5} />
      <Line points={[op.plane.origin, at(op.grab)]} color={color} lineWidth={1} dashed dashSize={20} gapSize={12} />
      <Line points={[op.plane.origin, at(op.grab + op.angle)]} color={color} lineWidth={2} />
    </>
  )
}

export function HoverMarker({ hover }: { hover: HoverPoint }) {
  return <SnapMarker position={toWorld(hover.frame, [hover.point[0], hover.point[1], 0])} onTarget={hover.onTarget} />
}
