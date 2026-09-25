import { useMemo } from 'react'
import { Vector3 } from 'three'
import { rectFromCorners } from '../model/geometry'
import type { ModelDocument } from '../model/types'
import { add, scale } from '../model/vec'
import type { Op, PushPullOp } from '../store/toolStore'
import { pushPullPreview } from '../tools/preview'
import { BodyMesh } from './BodyMesh'
import { ACCENT } from './colors'
import { SketchMesh } from './SketchMesh'

/** Pil längs normalen, som visar åt vilket håll push/pull drar. */
function Arrow({ op }: { op: PushPullOp }) {
  const dir = useMemo(() => new Vector3(...op.normal), [op.normal])
  const tip = add(op.anchor, scale(op.normal, op.distance))
  // ArrowHelper läser riktningen bara när den skapas, därav key.
  return <arrowHelper key={op.normal.join()} args={[dir, new Vector3(), 160, ACCENT, 50, 30]} position={tip} />
}

export function OpPreview({ op, doc }: { op: Op; doc: ModelDocument }) {
  if (op.kind === 'rect') {
    const r = rectFromCorners(op.first, op.current)
    if (r.x1 - r.x0 <= 0 && r.y1 - r.y0 <= 0) return null
    return <SketchMesh frame={op.frame} rect={r} emphasis="selected" />
  }
  const body = pushPullPreview(op, doc)
  return (
    <>
      {body && <BodyMesh body={body} preview />}
      <Arrow op={op} />
    </>
  )
}
