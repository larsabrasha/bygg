import { faceBounds, faceFrame, toLocal, toWorld } from './frame'
import { bodyCenter } from './geometry'
import { resolveBodies } from './resolve'
import { FACES, type Body, type Face, type Frame, type ModelDocument, type Rect, type Shape, type Vec3 } from './types'
import { dot, sub } from './vec'

/**
 * Tapp och tapphål: en tapp på host (t.ex. en sarg) som går in i into (ett ben).
 * Tappen läggs till på host och skärs ut ur into, med samma form, så att de
 * alltid passar ihop. Här räknas var den sitter och hur stor den blir.
 */

/** Hur långt från into en ände på host får ligga och ändå räknas som att den ligger an, i mm. */
const TOUCH = 1

/** Tumregler: tjockleken en tredjedel av virket, en ansats på var sida, två tredjedelar in. */
const THICKNESS_SHARE = 1 / 3
const SHOULDER_SHARE = 0.1
const MIN_SHOULDER = 5
const DEPTH_SHARE = 2 / 3
const MIN_SIZE = 4

export interface Tenon {
  /** Tappens frame: i ytan på host, n pekar in i into. */
  frame: Frame
  profile: Rect
  shape?: Shape
  /** Hur långt in tappen går. */
  depth: number
}

/** Avståndet från en punkt (i into:s egna koordinater) till into:s låda; 0 om den ligger i eller på den. */
function distanceToBox(into: Body, [x, y, z]: Vec3): number {
  const { x0, y0, x1, y1 } = into.profile
  const d = (v: number, lo: number, hi: number) => Math.max(lo - v, 0, v - hi)
  return Math.hypot(d(x, x0, x1), d(y, y0, y1), d(z, into.z0, into.z1))
}

/** Hur långt strålen från p (into:s koordinater) längs dir går innan den lämnar into:s låda. */
function exitDistance(into: Body, p: Vec3, dir: Vec3): number {
  const lo: Vec3 = [into.profile.x0, into.profile.y0, into.z0]
  const hi: Vec3 = [into.profile.x1, into.profile.y1, into.z1]
  let t = Infinity
  for (let k = 0; k < 3; k++) {
    if (Math.abs(dir[k]!) < 1e-9) continue
    const edge = dir[k]! > 0 ? hi[k]! : lo[k]!
    t = Math.min(t, (edge - p[k]!) / dir[k]!)
  }
  return Math.max(0, t)
}

/** Änden på host som ligger an mot into och pekar mot den, eller null. */
export function facingFace(host: Body, into: Body): Face | null {
  const target = bodyCenter(into)
  let best: { face: Face; dist: number } | null = null
  for (const face of FACES) {
    const f = faceFrame(host, face)
    const r = faceBounds(host, face)
    const center = toWorld(f, [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0])
    if (dot(f.n, sub(target, center)) <= 0) continue
    const dist = distanceToBox(into, toLocal(into.frame, center))
    if (dist <= TOUCH && (!best || dist < best.dist)) best = { face, dist }
  }
  return best?.face ?? null
}

/** Tappen, eller ett felmeddelande om delarna inte ligger an mot varandra. */
export function tenonFor(host: Body, into: Body): Tenon | string {
  const face = facingFace(host, into)
  if (!face) return 'Delarna måste ligga an mot varandra, med änden mot delen tappen ska in i'
  const frame = faceFrame(host, face)
  const r = faceBounds(host, face)
  const [cx, cy] = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]
  const [w, h] = [r.x1 - r.x0, r.y1 - r.y0]

  // En rund del (änden av en cylinder) får en rund tapp, halva diametern.
  const round = host.shape === 'circle' && face[0] === 'n'
  const thin = w <= h ? 'u' : 'v'
  const small = Math.min(w, h)
  const large = Math.max(w, h)
  const thickness = Math.max(MIN_SIZE, Math.round(round ? small / 2 : small * THICKNESS_SHARE))
  const shoulder = Math.max(MIN_SHOULDER, Math.round(large * SHOULDER_SHARE))
  const across = round ? thickness : Math.max(MIN_SIZE, large - 2 * shoulder)
  const [tw, th] = thin === 'u' ? [thickness, across] : [across, thickness]

  const center = toWorld(frame, [cx, cy, 0])
  const dir = [dot(frame.n, into.frame.u), dot(frame.n, into.frame.v), dot(frame.n, into.frame.n)] as Vec3
  const room = exitDistance(into, toLocal(into.frame, center), dir)
  const depth = Math.max(MIN_SIZE, Math.round(room * DEPTH_SHARE))

  return {
    frame,
    profile: { x0: cx - tw / 2, y0: cy - th / 2, x1: cx + tw / 2, y1: cy + th / 2 },
    ...(round && { shape: 'circle' as const }),
    depth,
  }
}

/** Det i en kopia som påverkar var en tapp sitter: läget och formens mått. */
function fitKey(doc: ModelDocument, id: string): string | null {
  const inst = doc.instances.find((i) => i.id === id)
  const def = inst && doc.defs.find((d) => d.id === inst.defId)
  if (!inst || !def) return null
  return JSON.stringify([inst.frame, def.profile, def.shape, def.z0, def.z1])
}

/**
 * Tapparna följer sina delar: har sargen eller benet ändrats (läge eller mått)
 * räknas tappen om med tumreglerna, så att den sitter mitt på änden och har
 * rätt storlek. Ändrar man bara tappen själv ligger ändringen kvar, tills
 * sargen eller benet ändras nästa gång. Ligger delarna inte längre an mot
 * varandra behålls tappen som den var (den har då följt med sargen, se
 * carryTools). before är dokumentet före ändringen.
 */
export function refitJoints(before: ModelDocument, after: ModelDocument): ModelDocument {
  const changed = (id: string) => fitKey(before, id) !== fitKey(after, id)
  const joints = after.instances.filter(
    (t) => t.combine?.op === 'joint' && t.combine.into && (changed(t.combine.host) || changed(t.combine.into)),
  )
  if (joints.length === 0) return after
  const bodies = resolveBodies(after)
  const instances = new Map(after.instances.map((i) => [i.id, i]))
  const defs = new Map(after.defs.map((d) => [d.id, d]))
  for (const t of joints) {
    const host = bodies.find((b) => b.id === t.combine!.host)
    const into = bodies.find((b) => b.id === t.combine!.into)
    const def = defs.get(t.defId)
    // En tapp vars form delas med en annan kopia räknas inte om (den andra skulle ändras med),
    // och inte heller en vars mått eller läge man styr med uttryck: där bestämmer man själv.
    const shared = after.instances.some((i) => i.defId === t.defId && i.id !== t.id)
    if (!host || !into || !def || shared || def.dims || t.pos) continue
    const tenon = tenonFor(host, into)
    if (typeof tenon === 'string') continue
    const { shape: _old, ...rest } = def
    void _old
    defs.set(def.id, {
      ...rest,
      profile: tenon.profile,
      ...(tenon.shape && { shape: tenon.shape }),
      z0: 0,
      z1: tenon.depth,
    })
    instances.set(t.id, { ...t, frame: tenon.frame })
  }
  return {
    ...after,
    defs: after.defs.map((d) => defs.get(d.id)!),
    instances: after.instances.map((i) => instances.get(i.id)!),
  }
}
