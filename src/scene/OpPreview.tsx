import { useMemo } from 'react'
import { Vector3 } from 'three'
import { toWorld } from '../model/frame'
import { rectFromCorners } from '../model/geometry'
import { add, scale } from '../model/vec'
import type { HoverPoint, Op, PushPullOp } from '../store/toolStore'
import { ACCENT } from './colors'
import { SketchMesh } from './SketchMesh'
import { SnapMarker } from './SnapMarker'

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
  const at = add(op.plane.origin, add(scale(op.plane.u, op.delta[0]), scale(op.plane.v, op.delta[1])))
  return <SnapMarker position={at} onTarget={op.onTarget[0] || op.onTarget[1]} />
}

export function HoverMarker({ hover }: { hover: HoverPoint }) {
  return <SnapMarker position={toWorld(hover.frame, [hover.point[0], hover.point[1], 0])} onTarget={hover.onTarget} />
}
