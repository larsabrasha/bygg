import type { Body, Face, Frame, Rect, Vec2, Vec3 } from './types'
import { add, dot, neg, scale, sub } from './vec'

/** Golvplanet y = 0. u = +X, v = −Z, så att n = +Y (uppåt). */
export const GROUND_FRAME: Frame = { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] }

export function toLocal(f: Frame, p: Vec3): Vec3 {
  const d = sub(p, f.origin)
  return [dot(d, f.u), dot(d, f.v), dot(d, f.n)]
}

export function toLocal2D(f: Frame, p: Vec3): Vec2 {
  const [x, y] = toLocal(f, p)
  return [x, y]
}

export function toWorld(f: Frame, [x, y, z]: Vec3): Vec3 {
  return add(add(add(f.origin, scale(f.u, x)), scale(f.v, y)), scale(f.n, z))
}

/**
 * Frame för en skiss på en av kroppens sidor. Origo ligger i sidans plan,
 * n pekar ut från kroppen och u × v = n.
 */
export function faceFrame(body: Body, face: Face): Frame {
  const { frame: F, profile: r, z0, z1 } = body
  switch (face) {
    case 'u+':
      return { origin: add(F.origin, scale(F.u, r.x1)), u: F.v, v: F.n, n: F.u }
    case 'u-':
      return { origin: add(F.origin, scale(F.u, r.x0)), u: F.n, v: F.v, n: neg(F.u) }
    case 'v+':
      return { origin: add(F.origin, scale(F.v, r.y1)), u: F.n, v: F.u, n: F.v }
    case 'v-':
      return { origin: add(F.origin, scale(F.v, r.y0)), u: F.u, v: F.n, n: neg(F.v) }
    case 'n+':
      return { origin: add(F.origin, scale(F.n, z1)), u: F.u, v: F.v, n: F.n }
    case 'n-':
      return { origin: add(F.origin, scale(F.n, z0)), u: F.v, v: F.u, n: neg(F.n) }
  }
}

/** Kroppens hörn i världskoordinater, för de hörn som ligger på given sida. */
function faceCorners(body: Body, face: Face): Vec3[] {
  const { profile: r, z0, z1 } = body
  const xs = face === 'u+' ? [r.x1] : face === 'u-' ? [r.x0] : [r.x0, r.x1]
  const ys = face === 'v+' ? [r.y1] : face === 'v-' ? [r.y0] : [r.y0, r.y1]
  const zs = face === 'n+' ? [z1] : face === 'n-' ? [z0] : [z0, z1]
  const out: Vec3[] = []
  for (const x of xs) for (const y of ys) for (const z of zs) out.push(toWorld(body.frame, [x, y, z]))
  return out
}

/** Sidans utsträckning i sin egen skiss-frame (se faceFrame). Används för snäppning. */
export function faceBounds(body: Body, face: Face): Rect {
  const f = faceFrame(body, face)
  const pts = faceCorners(body, face).map((p) => toLocal2D(f, p))
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}
