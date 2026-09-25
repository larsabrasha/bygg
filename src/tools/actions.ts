import { faceBounds, faceFrame, GROUND_FRAME, toLocal2D } from '../model/frame'
import { rectFromCorners, snap } from '../model/geometry'
import { parseLength } from '../model/measure'
import type { Face, Frame, Rect, Vec2, Vec3 } from '../model/types'
import { add, closestParamOnLine, dot, scale, sub } from '../model/vec'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore, type Op, type PushPullTarget } from '../store/toolStore'

/**
 * Verktygslogik utan three.js: scenen räknar ut träffar och strålar och
 * anropar dessa funktioner. Därför går flödena att testa i node.
 */

export type PickTarget = { kind: 'ground' } | { kind: 'body'; id: string; face: Face } | { kind: 'sketch'; id: string }

export interface Hit {
  point: Vec3
  target: PickTarget
}

export interface Ray {
  origin: Vec3
  dir: Vec3
}

/** Rutnät för snäppning när man ritar, i mm. */
export const GRID_STEP = 10

const docs = () => useDocumentStore.getState()
const tools = () => useToolStore.getState()

/** Planet och ytans kanter för en träff. Null om träffen inte går att rita på. */
function planeForHit(hit: Hit): { frame: Frame; bounds: Rect | null } | null {
  const { doc } = docs()
  switch (hit.target.kind) {
    case 'ground':
      return { frame: GROUND_FRAME, bounds: null }
    case 'sketch': {
      const id = hit.target.id
      const s = doc.sketches.find((x) => x.id === id)
      return s ? { frame: s.frame, bounds: s.rect } : null
    }
    case 'body': {
      const { id, face } = hit.target
      const b = doc.bodies.find((x) => x.id === id)
      return b ? { frame: faceFrame(b, face), bounds: faceBounds(b, face) } : null
    }
  }
}

function snapPoint(p: Vec2, bounds: Rect | null, extra: Vec2 | null, tol: number): Vec2 {
  const xs = bounds ? [bounds.x0, bounds.x1] : []
  const ys = bounds ? [bounds.y0, bounds.y1] : []
  if (extra) {
    xs.push(extra[0])
    ys.push(extra[1])
  }
  return [snap(p[0], GRID_STEP, xs, tol), snap(p[1], GRID_STEP, ys, tol)]
}

function pushPullTargetFor(hit: Hit): { target: PushPullTarget; normal: Vec3 } | null {
  const { doc } = docs()
  const t = hit.target
  if (t.kind === 'sketch') {
    const s = doc.sketches.find((x) => x.id === t.id)
    return s ? { target: t, normal: s.frame.n } : null
  }
  if (t.kind === 'body') {
    const b = doc.bodies.find((x) => x.id === t.id)
    return b ? { target: t, normal: faceFrame(b, t.face).n } : null
  }
  return null
}

/** Tryck/klick utan pågående operation. tol = snäpptolerans i mm. */
export function tap(hit: Hit | null, tol: number) {
  const { tool, setOp } = tools()

  if (tool === 'select') {
    const t = hit?.target
    docs().select(t && t.kind !== 'ground' ? { kind: t.kind, id: t.id } : null)
    return
  }

  if (!hit) return

  if (tool === 'rect') {
    const plane = planeForHit(hit)
    if (!plane) return
    const first = snapPoint(toLocal2D(plane.frame, hit.point), plane.bounds, null, tol)
    setOp({ kind: 'rect', ...plane, first, current: first })
    return
  }

  const pp = pushPullTargetFor(hit)
  if (pp) setOp({ kind: 'pushpull', ...pp, anchor: hit.point, distance: 0 })
}

/** Pekaren flyttas (eller trycks ned) under en pågående operation. */
export function move(ray: Ray, tol: number) {
  const { op, setOp } = tools()
  if (!op) return

  if (op.kind === 'rect') {
    const { frame } = op
    const denom = dot(ray.dir, frame.n)
    if (Math.abs(denom) < 1e-6) return
    const t = dot(sub(frame.origin, ray.origin), frame.n) / denom
    if (t < 0) return
    const p = toLocal2D(frame, add(ray.origin, scale(ray.dir, t)))
    setOp({ ...op, current: snapPoint(p, op.bounds, op.first, tol) })
    return
  }

  const t = closestParamOnLine(op.anchor, op.normal, ray.origin, ray.dir)
  if (t !== null) setOp({ ...op, distance: Math.round(t) })
}

/** Avslutar operationen med nuvarande förhandsvisning. */
export function commit(op: Op | null = tools().op) {
  if (!op) return
  const d = docs()
  if (op.kind === 'rect') d.addSketch(op.frame, rectFromCorners(op.first, op.current))
  else if (op.target.kind === 'sketch') d.pushPullSketch(op.target.id, op.distance)
  else d.pushPullBody(op.target.id, op.target.face, op.distance)
  tools().setOp(null)
}

export function cancel() {
  tools().setOp(null)
}

/** Aktuella mått för förhandsvisningen: [längd, bredd] för rektangel, [avstånd] för push/pull. */
export function liveMeasure(op: Op): number[] {
  if (op.kind === 'rect') return [Math.abs(op.current[0] - op.first[0]), Math.abs(op.current[1] - op.first[1])]
  return [op.distance]
}

/**
 * Avslutar med inskrivna mått. Tomt fält = behåll förhandsvisningens värde.
 * Riktningen tas från förhandsvisningen, som i SketchUp. Ett minustecken vänder den.
 * Returnerar false om något fält inte går att tolka.
 */
export function applyMeasure(): boolean {
  const { op, measure } = tools()
  if (!op) return false

  const read = (text: string, live: number) => (text.trim() === '' ? live : parseLength(text))

  if (op.kind === 'rect') {
    const [liveW, liveH] = liveMeasure(op) as [number, number]
    const w = read(measure[0], liveW)
    const h = read(measure[1], liveH)
    if (w === null || h === null) return false
    const sx = Math.sign(op.current[0] - op.first[0]) || 1
    const sy = Math.sign(op.current[1] - op.first[1]) || 1
    commit({ ...op, current: [op.first[0] + sx * w, op.first[1] + sy * h] })
    return true
  }

  const value = read(measure[0], op.distance)
  if (value === null) return false
  const explicitSign = measure[0].trim().startsWith('-')
  const distance = explicitSign ? value : (Math.sign(op.distance) || 1) * Math.abs(value)
  commit({ ...op, distance })
  return true
}
