import { toWorld } from './frame'
import type { Body, Vec3 } from './types'
import { dot, length, scale, sub } from './vec'

/** En punkt man tryckt på med Mät. */
export interface RulerPoint {
  point: Vec3
  /**
   * Normalen för ytan (eller golvet) punkten ligger på, om den inte snäppte
   * till ett hörn eller en kantmitt. Två parallella ytor mäts vinkelrätt.
   */
  normal: Vec3 | null
  /** Vad punkten snäppte till. */
  snap: 'corner' | 'edge' | null
}

/** Delens hörn och kantmitter i världskoordinater. */
export function snapCandidates(body: Body): { point: Vec3; snap: 'corner' | 'edge' }[] {
  const { profile: r, z0, z1, frame } = body
  const xs = [r.x0, (r.x0 + r.x1) / 2, r.x1]
  const ys = [r.y0, (r.y0 + r.y1) / 2, r.y1]
  const zs = [z0, (z0 + z1) / 2, z1]
  const out: { point: Vec3; snap: 'corner' | 'edge' }[] = []
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) {
        // Hur många koordinater som ligger mitt emellan: 0 = hörn, 1 = kantmitt (2 = ytmitt, 3 = delens mitt).
        const mids = +(i === 1) + +(j === 1) + +(k === 1)
        if (mids > 1) continue
        out.push({ point: toWorld(frame, [xs[i]!, ys[j]!, zs[k]!]), snap: mids === 0 ? 'corner' : 'edge' })
      }
  return out
}

/**
 * Punkten för ett tryck på en yta: närmaste hörn eller kantmitt inom tol mm
 * på någon av delarna (hörn går före kantmitter), annars själva träffpunkten
 * på ytan. Alla delar räknas, så att ett hörn på grannen går att träffa även
 * om fingret landade på delen bredvid.
 */
export function rulerPointOn(bodies: readonly Body[], hit: Vec3, normal: Vec3, tol: number): RulerPoint {
  let best: { point: Vec3; snap: 'corner' | 'edge'; score: number } | null = null
  for (const body of bodies)
    for (const c of snapCandidates(body)) {
      const dist = length(sub(c.point, hit))
      if (dist > tol) continue
      const score = dist - (c.snap === 'corner' ? tol / 2 : 0)
      if (!best || score < best.score) best = { ...c, score }
    }
  return best ? { point: best.point, normal: null, snap: best.snap } : { point: hit, normal, snap: null }
}

export interface RulerResult {
  from: Vec3
  to: Vec3
  distance: number
  /** to − from per världsaxel. */
  delta: Vec3
  /** 'planes' = vinkelrätt mellan två parallella ytor, 'points' = rakt mellan punkterna. */
  kind: 'planes' | 'points'
}

const clean = (x: number) => (Math.abs(x - Math.round(x * 1e6) / 1e6) < 1e-9 ? Math.round(x * 1e6) / 1e6 : x) + 0

/**
 * Avståndet mellan två punkter. Ligger båda på ytor som är parallella mäts
 * avståndet mellan ytorna, från den andra punkten rakt mot den första ytan.
 */
export function rulerResult(a: RulerPoint, b: RulerPoint): RulerResult {
  if (a.normal && b.normal && Math.abs(Math.abs(dot(a.normal, b.normal)) - 1) < 1e-6) {
    const along = dot(sub(b.point, a.point), a.normal)
    const foot = sub(b.point, scale(a.normal, along))
    const delta = sub(b.point, foot).map(clean) as Vec3
    return { from: foot, to: b.point, distance: clean(Math.abs(along)), delta, kind: 'planes' }
  }
  const delta = sub(b.point, a.point).map(clean) as Vec3
  return { from: a.point, to: b.point, distance: clean(length(delta)), delta, kind: 'points' }
}
