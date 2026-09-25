import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import { extent, widthAxis } from '../model/partAxes'
import type { Axis, Body, Vec3 } from '../model/types'
import { GRAIN } from './colors'

const unit: Record<Axis, Vec3> = { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }
const idx: Record<Axis, 0 | 1 | 2> = { u: 0, v: 1, n: 2 }

/**
 * Dubbelpil längs fibern, ritad på delens översida (sidan vinkelrätt mot tjockleken).
 * I delens lokala koordinater; placeras inuti BodyMesh-gruppen.
 */
export function GrainArrow({ body }: { body: Body }) {
  const segments = useMemo(() => {
    const { x0, x1, y0, y1 } = body.profile
    const lo: Vec3 = [x0, y0, body.z0]
    const hi: Vec3 = [x1, y1, body.z1]
    const g = body.grainAxis
    const w = widthAxis(body)
    const t = body.thicknessAxis
    const len = extent(body, g)
    const half = len * 0.3
    const head = Math.min(len * 0.1, extent(body, w) * 0.35, 40)

    // Mitten av sidan vid tjocklekens maxsida, lyft en halv mm så att pilen syns.
    const c: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
    c[idx[t]] = hi[idx[t]] + 0.5
    const at = (along: number, across: number): Vec3 => {
      const p: Vec3 = [...c]
      p[idx[g]] += along * unit[g][idx[g]]
      p[idx[w]] += across * unit[w][idx[w]]
      return p
    }
    return [
      at(-half, 0),
      at(half, 0),
      at(half, 0),
      at(half - head, head * 0.6),
      at(half, 0),
      at(half - head, -head * 0.6),
      at(-half, 0),
      at(-half + head, head * 0.6),
      at(-half, 0),
      at(-half + head, -head * 0.6),
    ]
  }, [body])

  return <Line points={segments} segments color={GRAIN} lineWidth={2} />
}
