import { toWorld } from './frame'
import { AXES } from './partAxes'
import type { Axis, Body, Vec3 } from './types'
import { add, length, scale, sub } from './vec'

/** En kant på delen som ett mått sitter på. */
export interface DimensionEdge {
  axis: Axis
  from: Vec3
  to: Vec3
  /** Åt vilket håll från delen måttet flyttas ut (enhetsvektor, vinkelrät mot kanten). */
  out: Vec3
}

/**
 * En kant per axel att sätta måttet på: den av de fyra parallella kanterna
 * som ligger närmast kameran. Det blir kanterna som går ut från hörnet
 * närmast betraktaren, som man ser.
 */
export function dimensionEdges(body: Body, camera: Vec3): DimensionEdge[] {
  const { profile: r, z0, z1, frame } = body
  const lo: Vec3 = [r.x0, r.y0, z0]
  const hi: Vec3 = [r.x1, r.y1, z1]
  return AXES.map((axis, i) => {
    const [j, k] = [0, 1, 2].filter((x) => x !== i) as [number, number]
    let best: DimensionEdge | null = null
    let bestDist = Infinity
    for (const sj of [false, true])
      for (const sk of [false, true]) {
        const a: Vec3 = [0, 0, 0]
        a[j] = sj ? hi[j]! : lo[j]!
        a[k] = sk ? hi[k]! : lo[k]!
        const b: Vec3 = [...a]
        a[i] = lo[i]!
        b[i] = hi[i]!
        const from = toWorld(frame, a)
        const to = toWorld(frame, b)
        const dist = length(sub(scale(add(from, to), 0.5), camera))
        if (dist >= bestDist) continue
        bestDist = dist
        const axisDir = (n: number, positive: boolean) => scale(frame[AXES[n]!], positive ? 1 : -1)
        const diag = add(axisDir(j, sj), axisDir(k, sk))
        best = { axis, from, to, out: scale(diag, 1 / length(diag)) }
      }
    return best!
  })
}
