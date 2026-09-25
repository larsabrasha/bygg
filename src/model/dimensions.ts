import { toLocal, toWorld } from './frame'
import { AXES } from './partAxes'
import type { Axis, Body, Vec3 } from './types'
import { add, cross, dot, length, scale, sub } from './vec'

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
  if (body.shape === 'circle') return circleEdges(body, camera)
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

/**
 * En cylinder har två mått: diametern (på axeln u; v är samma mått) tvärs
 * över ändytan närmast kameran, och längden längs konturen, den linje på sidan
 * där cylindern slutar som man ser den. Den undre konturen, eller den högra om
 * cylindern står upp. Så hamnar båda på delen och inte vid lådans hörn.
 *
 * Inte linjen närmast kameran: den syns mitt på cylindern, och etiketten
 * hoppade då mellan över- och undersidan när delen ändrades under ett drag.
 */
function circleEdges(body: Body, camera: Vec3): DimensionEdge[] {
  const { profile: r, z0, z1, frame } = body
  const [cx, cy] = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]
  const radius = (r.x1 - r.x0) / 2
  const [px, py, pz] = toLocal(frame, camera)
  // Riktningen mot kameran i profilens plan; tittar man rakt längs cylindern duger vilken som helst.
  const toward = Math.hypot(px - cx, py - cy)
  const [dx, dy] = toward > 1e-9 ? [(px - cx) / toward, (py - cy) / toward] : [1, 0]
  const out = (x: number, y: number) => add(scale(frame.u, x), scale(frame.v, y))
  // Konturen ligger tvärs mot riktningen mot kameran. Av de två: den som ligger lägst,
  // och om de ligger lika högt (cylindern står upp) den till höger sett från kameran.
  const toCamera = sub(camera, toWorld(frame, [cx, cy, (z0 + z1) / 2]))
  const right = cross([0, 1, 0], toCamera)
  const w = out(dy, -dx)
  const flip = Math.abs(w[1]) < 0.1 ? dot(w, right) < 0 : w[1] > 0
  const [ex, ey] = flip ? [-dy, dx] : [dy, -dx]
  const side = (z: number): Vec3 => [cx + radius * ex, cy + radius * ey, z]
  const cap = Math.abs(pz - z1) <= Math.abs(pz - z0) ? z1 : z0
  return [
    {
      axis: 'u',
      from: toWorld(frame, [cx + radius * dy, cy - radius * dx, cap]),
      to: toWorld(frame, [cx - radius * dy, cy + radius * dx, cap]),
      out: scale(frame.n, cap === z1 ? 1 : -1),
    },
    { axis: 'n', from: toWorld(frame, side(z0)), to: toWorld(frame, side(z1)), out: out(ex, ey) },
  ]
}
