import { faceBounds, faceCorners, faceFrame, toLocal2D } from './frame'
import { bodiesBox } from './geometry'
import { FACES, type Body, type Face, type Frame, type Vec3 } from './types'
import { dot, sub } from './vec'

/** Så nära (mm) två ytor ska ligga för att den ena ska vila mot den andra. */
export const CONTACT_TOLERANCE = 1

/** Minst så mycket (mm, åt båda håll) ska två ytor överlappa; en kant mot en kant räknas inte. */
const MIN_OVERLAP = 1

const UP: Vec3 = [0, 1, 0]
/** cos för vinkeln två ytor får skilja för att räknas som parallella (ungefär 2,5°). */
const PARALLEL = 0.999

/** Om sidan face på moving vilar mot någon sida av other: motsatta normaler, samma plan (inom CONTACT_TOLERANCE), överlapp. */
export function contact(moving: Body, face: Face, other: Body): boolean {
  const a = faceFrame(moving, face)
  const bounds = faceBounds(moving, face)
  return FACES.some((g) => {
    const b = faceFrame(other, g)
    if (dot(a.n, b.n) > -PARALLEL) return false
    if (Math.abs(dot(sub(b.origin, a.origin), a.n)) > CONTACT_TOLERANCE) return false
    const pts = faceCorners(other, g).map((p) => toLocal2D(a, p))
    const x0 = Math.max(bounds.x0, Math.min(...pts.map((p) => p[0])))
    const x1 = Math.min(bounds.x1, Math.max(...pts.map((p) => p[0])))
    const y0 = Math.max(bounds.y0, Math.min(...pts.map((p) => p[1])))
    const y1 = Math.min(bounds.y1, Math.max(...pts.map((p) => p[1])))
    return x1 - x0 >= MIN_OVERLAP && y1 - y0 >= MIN_OVERLAP
  })
}

/** Den sida av b som vetter mest nedåt. */
function bottomFace(b: Body): Face {
  return FACES.reduce((best, f) => (dot(faceFrame(b, f).n, UP) < dot(faceFrame(b, best).n, UP) ? f : best))
}

/**
 * Planet man flyttar delarna i när man drar i dem (inte i en pil): det de vilar mot. Står de på
 * golvet eller på en annan del glider de längs golvet; hänger de mot en lodrät yta (en tavla på en
 * vägg, en front mot en stomme) glider de längs den. Planet följer den vilande delens kanter, så
 * att axellåset går längs dem. Null om de inte vilar mot något; då gäller ytan man tog i.
 *
 * Samma svar från alla håll man tittar: det är delarna, inte kameran, som bestämmer.
 */
export function supportPlane(moving: readonly Body[], others: readonly Body[]): Frame | null {
  if (moving.length === 0) return null
  // På golvet (y = 0).
  if (Math.abs(bodiesBox(moving).min[1]) <= CONTACT_TOLERANCE) {
    const low = moving.reduce((a, b) => (bodiesBox([b]).min[1] < bodiesBox([a]).min[1] ? b : a))
    const f = bottomFace(low)
    if (dot(faceFrame(low, f).n, UP) < -PARALLEL) return faceFrame(low, f)
    return { origin: [0, 0, 0], u: [0, 0, 1], v: [1, 0, 0], n: [0, 1, 0] }
  }
  // På en annan del: en sida som vetter nedåt och vilar mot en sida som vetter uppåt.
  let wall: Frame | null = null
  for (const b of moving)
    for (const f of FACES) {
      const frame = faceFrame(b, f)
      const down = dot(frame.n, UP) < -PARALLEL
      const level = Math.abs(dot(frame.n, UP)) < 1 - PARALLEL
      if (!down && !(level && !wall)) continue
      if (!others.some((o) => contact(b, f, o))) continue
      if (down) return frame
      wall = frame
    }
  return wall
}
