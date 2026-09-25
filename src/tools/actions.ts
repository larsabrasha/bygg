import { faceBounds, faceFrame, GROUND_FRAME, toLocal2D } from '../model/frame'
import { isConstant } from '../model/expr'
import { rectFromCorners } from '../model/geometry'
import { evaluateIn } from '../model/params'
import { resolveBodies } from '../model/resolve'
import { bodyKeyPoints, offsetTargets, planeTargets, snapDelta, snapValue, type PlaneTargets } from '../model/snapping'
import type { Body, DimExprs, Face, Frame, Rect, Vec2, Vec3 } from '../model/types'
import { add, closestParamOnLine, dot, length, scale, sub } from '../model/vec'
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

/** Rutnät för snäppning när man ritar och flyttar, i mm. */
export const GRID_STEP = 10
/** Om ena axelns förflyttning är mindre än så här i förhållande till den andra, låses den till 0. */
const AXIS_LOCK_RATIO = 0.15

const docs = () => useDocumentStore.getState()
const tools = () => useToolStore.getState()
const bodies = () => resolveBodies(docs().doc)
const findBody = (id: string): Body | undefined => bodies().find((b) => b.id === id)

/** Planet och ytans kanter för en träff. Null om träffen inte går att rita på. */
function planeForHit(hit: Hit): { frame: Frame; bounds: Rect | null } | null {
  switch (hit.target.kind) {
    case 'ground':
      return { frame: GROUND_FRAME, bounds: null }
    case 'sketch': {
      const id = hit.target.id
      const s = docs().doc.sketches.find((x) => x.id === id)
      return s ? { frame: s.frame, bounds: s.rect } : null
    }
    case 'body': {
      const b = findBody(hit.target.id)
      return b ? { frame: faceFrame(b, hit.target.face), bounds: faceBounds(b, hit.target.face) } : null
    }
  }
}

/** Mål för en rektangel i ett plan: ytans kanter, andra delar och ev. första hörnet. */
function rectTargets(frame: Frame, bounds: Rect | null): PlaneTargets {
  const t = planeTargets(bodies(), frame)
  if (bounds) {
    t.xs.push(bounds.x0, bounds.x1)
    t.ys.push(bounds.y0, bounds.y1)
  }
  return t
}

function snapPoint(p: Vec2, targets: PlaneTargets, tol: number): { point: Vec2; onTarget: [boolean, boolean] } {
  const x = snapValue(p[0], GRID_STEP, targets.xs, tol)
  const y = snapValue(p[1], GRID_STEP, targets.ys, tol)
  return { point: [x.value, y.value], onTarget: [x.onTarget, y.onTarget] }
}

function intersectPlane(ray: Ray, frame: Frame): Vec2 | null {
  const denom = dot(ray.dir, frame.n)
  if (Math.abs(denom) < 1e-6) return null
  const t = dot(sub(frame.origin, ray.origin), frame.n) / denom
  if (t < 0) return null
  return toLocal2D(frame, add(ray.origin, scale(ray.dir, t)))
}

function pushPullTargetFor(hit: Hit): { target: PushPullTarget; normal: Vec3 } | null {
  const t = hit.target
  if (t.kind === 'sketch') {
    const s = docs().doc.sketches.find((x) => x.id === t.id)
    return s ? { target: t, normal: s.frame.n } : null
  }
  if (t.kind === 'body') {
    const b = findBody(t.id)
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
    const targets = rectTargets(plane.frame, plane.bounds)
    const { point, onTarget } = snapPoint(toLocal2D(plane.frame, hit.point), targets, tol)
    // Första hörnet blir också ett mål, så att man kan dra rakt ut från det.
    const withFirst = { xs: [...targets.xs, point[0]], ys: [...targets.ys, point[1]] }
    setOp({ kind: 'rect', ...plane, targets: withFirst, first: point, current: point, onTarget })
    return
  }

  if (tool === 'move') {
    if (hit.target.kind !== 'body') return
    const b = findBody(hit.target.id)
    if (!b) return
    const f = faceFrame(b, hit.target.face)
    const plane: Frame = { ...f, origin: hit.point }
    setOp({
      kind: 'move',
      instanceId: b.id,
      plane,
      moving: bodyKeyPoints(b).map((p) => toLocal2D(plane, p)),
      targets: planeTargets(bodies(), plane, b.id),
      delta: [0, 0],
      onTarget: [false, false],
    })
    return
  }

  const pp = pushPullTargetFor(hit)
  if (pp) {
    const others = pp.target.kind === 'body' ? bodies().filter((b) => b.id !== pp.target.id) : bodies()
    setOp({
      kind: 'pushpull',
      ...pp,
      anchor: hit.point,
      targets: offsetTargets(others, hit.point, pp.normal),
      distance: 0,
      onTarget: false,
    })
  }
}

/** Muspekaren rör sig utan pågående operation: visa var första hörnet skulle hamna. */
export function hoverAt(hit: Hit | null, tol: number) {
  const { tool, setHoverPoint } = tools()
  if (tool !== 'rect' || !hit) {
    if (tools().hoverPoint) setHoverPoint(null)
    return
  }
  const plane = planeForHit(hit)
  if (!plane) return
  const { point, onTarget } = snapPoint(toLocal2D(plane.frame, hit.point), rectTargets(plane.frame, plane.bounds), tol)
  setHoverPoint({ frame: plane.frame, point, onTarget: onTarget[0] || onTarget[1] })
}

/** Pekaren flyttas (eller trycks ned) under en pågående operation. */
export function move(ray: Ray, tol: number) {
  const { op, setOp } = tools()
  if (!op) return

  if (op.kind === 'rect') {
    const p = intersectPlane(ray, op.frame)
    if (!p) return
    const { point, onTarget } = snapPoint(p, op.targets, tol)
    setOp({ ...op, current: point, onTarget })
    return
  }

  if (op.kind === 'move') {
    const raw = intersectPlane(ray, op.plane)
    if (!raw) return
    const snapped = snapDelta(raw, op.moving, op.targets, GRID_STEP, tol)
    const delta: Vec2 = [...snapped.delta]
    const onTarget: [boolean, boolean] = [...snapped.onTarget]
    // Axellås: nästan rak dragning blir helt rak.
    if (Math.abs(raw[1]) < AXIS_LOCK_RATIO * Math.abs(raw[0])) [delta[1], onTarget[1]] = [0, false]
    else if (Math.abs(raw[0]) < AXIS_LOCK_RATIO * Math.abs(raw[1])) [delta[0], onTarget[0]] = [0, false]
    setOp({ ...op, delta, onTarget })
    return
  }

  const t = closestParamOnLine(op.anchor, op.normal, ray.origin, ray.dir)
  if (t === null) return
  const s = snapValue(t, 1, op.targets, tol)
  setOp({ ...op, distance: s.value, onTarget: s.onTarget })
}

/** Förflyttningen i världskoordinater för en flytt-operation. */
export function moveDeltaWorld(op: Extract<Op, { kind: 'move' }>): Vec3 {
  return add(scale(op.plane.u, op.delta[0]), scale(op.plane.v, op.delta[1]))
}

/** Avslutar operationen med nuvarande förhandsvisning. */
export function commit(op: Op | null = tools().op, exprs: { dims?: DimExprs; depth?: string } = {}) {
  if (!op) return
  const d = docs()
  if (op.kind === 'rect') d.addSketch(op.frame, rectFromCorners(op.first, op.current), exprs.dims)
  else if (op.kind === 'move') {
    if (op.delta[0] !== 0 || op.delta[1] !== 0) d.moveInstance(op.instanceId, moveDeltaWorld(op))
  } else {
    if (op.target.kind === 'sketch') d.pushPullSketch(op.target.id, op.distance, exprs.depth)
    else d.pushPullBody(op.target.id, op.target.face, op.distance)
    if (op.distance !== 0) tools().setLastPushPull({ distance: op.distance, ...(exprs.depth && { expr: exprs.depth }) })
  }
  tools().setOp(null)
}

/**
 * Avslutar en push/pull med samma djup som förra gången (som dubbelklick i
 * SketchUp). Var förra djupet ett uttryck följer den nya delen också parametern.
 * Returnerar false om det inte finns något förra djup.
 */
export function repeatLastPushPull(): boolean {
  const { op, lastPushPull } = tools()
  if (op?.kind !== 'pushpull' || !lastPushPull) return false
  commit({ ...op, distance: lastPushPull.distance }, { depth: lastPushPull.expr })
  return true
}

export function cancel() {
  tools().setOp(null)
}

/** Aktuella mått för förhandsvisningen: [längd, bredd] för rektangel, annars [avstånd]. */
export function liveMeasure(op: Op): number[] {
  if (op.kind === 'rect') return [Math.abs(op.current[0] - op.first[0]), Math.abs(op.current[1] - op.first[1])]
  if (op.kind === 'move') return [Math.hypot(op.delta[0], op.delta[1])]
  return [op.distance]
}

/**
 * Avslutar med inskrivna mått. Tomt fält = behåll förhandsvisningens värde.
 * Fälten tar emot tal och uttryck med parametrar. Riktningen tas från
 * förhandsvisningen, som i SketchUp; ett minustecken vänder den.
 * Uttryck med parametrar sparas på skissen/delen så att de följer parametern.
 * Returnerar false om något fält inte går att beräkna.
 */
export function applyMeasure(): boolean {
  const { op, measure } = tools()
  if (!op) return false
  const { params } = docs().doc

  const read = (text: string, live: number): number | null => {
    if (text.trim() === '') return live
    const r = evaluateIn(text, params)
    return r.ok ? r.value : null
  }
  const exprOf = (text: string) => (text.trim() !== '' && !isConstant(text) ? text.trim() : undefined)
  const signed = (text: string, value: number, liveSign: number) =>
    text.trim().startsWith('-') ? value : (liveSign || 1) * Math.abs(value)

  if (op.kind === 'rect') {
    const [liveW, liveH] = liveMeasure(op) as [number, number]
    const w = read(measure[0], liveW)
    const h = read(measure[1], liveH)
    if (w === null || h === null) return false
    const sx = Math.sign(op.current[0] - op.first[0]) || 1
    const sy = Math.sign(op.current[1] - op.first[1]) || 1
    const dims: DimExprs = {}
    const eu = exprOf(measure[0])
    const ev = exprOf(measure[1])
    if (eu) dims.u = { expr: eu, anchor: sx > 0 ? 'min' : 'max' }
    if (ev) dims.v = { expr: ev, anchor: sy > 0 ? 'min' : 'max' }
    commit({ ...op, current: [op.first[0] + sx * Math.abs(w), op.first[1] + sy * Math.abs(h)] }, { dims })
    return true
  }

  const value = read(measure[0], liveMeasure(op)[0]!)
  if (value === null) return false

  if (op.kind === 'move') {
    const len = length([op.delta[0], op.delta[1], 0])
    if (len === 0) return false
    const k = value / len
    commit({ ...op, delta: [op.delta[0] * k, op.delta[1] * k] })
    return true
  }

  commit({ ...op, distance: signed(measure[0], value, Math.sign(op.distance)) }, { depth: exprOf(measure[0]) })
  return true
}
