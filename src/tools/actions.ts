import { faceBounds, faceFrame, GROUND_FRAME, rotateFrame, toLocal2D, toWorld } from '../model/frame'
import { isConstant } from '../model/expr'
import { bodyCenter, bodyExtents, circleRect, pushPullMin, rectFromCorners, rectSize } from '../model/geometry'
import { evaluateIn } from '../model/params'
import { rulerPointOn, type RulerPoint } from '../model/ruler'
import { resolveBodies } from '../model/resolve'
import { bodyKeyPoints, offsetTargets, planeTargets, snapDelta, snapValue, type PlaneTargets } from '../model/snapping'
import type { Body, DimExprs, Face, Frame, Rect, Vec2, Vec3 } from '../model/types'
import { arrowDir } from '../model/arrowDir'
import { add, closestParamOnLine, cross, dot, length, scale, sub } from '../model/vec'
import { useDocumentStore, type Selection } from '../store/documentStore'
import {
  useToolStore,
  type Axis,
  type CopyStep,
  type LastCopy,
  type LastOp,
  type MoveOp,
  type Op,
  type PushPullTarget,
  type RectOp,
  type RotateOp,
} from '../store/toolStore'

/**
 * Verktygslogik utan three.js: scenen räknar ut träffar och strålar och
 * anropar dessa funktioner. Därför går flödena att testa i node.
 */

export type PickTarget =
  | { kind: 'ground' }
  | { kind: 'body'; id: string; face?: Face }
  | { kind: 'sketch'; id: string }
  /** Pilen på det valda; att dra i den gör push/pull. dir = riktningen den ritas i just nu (se arrowDir). */
  | { kind: 'handle'; dir?: Vec3 }
  /** En av flyttpilarna (X, Y, Z) i Flytta-läget. */
  | { kind: 'axis'; axis: Axis }
  /** En av bågarna i Flytta-läget; att dra i den vrider delen runt axeln. */
  | { kind: 'rotate'; axis: Axis }

export interface Hit {
  point: Vec3
  target: PickTarget
}

export interface Ray {
  origin: Vec3
  dir: Vec3
  /** Skärmens upp i världen (kamerans upp). Saknas den räknas världens Y som upp. */
  up?: Vec3
}

/**
 * Linjen som pekaren följer när man drar i en pil från from längs dir:
 * lutad om pilen pekar rakt mot kameran, så som den ritas (arrowDir).
 */
function dragLine(from: Vec3, dir: Vec3, ray: Ray): Vec3 {
  const toCamera = sub(ray.origin, from)
  return arrowDir(dir, scale(toCamera, 1 / length(toCamera)), ray.up ?? [0, 1, 0])
}

/** Flest kopior i en rad, så att ett felskrivet antal inte fryser appen. */
export const MAX_COPIES = 200

/** Rutnät för snäppning när man ritar och flyttar, i mm. */
export const GRID_STEP = 10
/** Om ena axelns förflyttning är mindre än så här i förhållande till den andra, låses den till 0. */
const AXIS_LOCK_RATIO = 0.15

const docs = () => useDocumentStore.getState()
const tools = () => useToolStore.getState()
const bodies = () => resolveBodies(docs().doc)
const findBody = (id: string): Body | undefined => bodies().find((b) => b.id === id)

/** Planet och ytans kanter för en träff. Null om träffen inte går att rita på. */
function planeForHit(hit: Hit): { frame: Frame; bounds: Rect | null; on?: string } | null {
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
      const face = hit.target.face
      // Inne i något som skurits ut finns ingen sida att rita på.
      if (!b || !face) return null
      // På en cylinders runda sida: planet som nuddar cylindern längs en linje, i den av
      // de fyra huvudriktningarna man tryckte närmast (sidan på lådan runt cylindern).
      // Linjen där planet nuddar är ett snäppmål (kantmitt), så att man kan rita mitt på den.
      return { frame: faceFrame(b, face), bounds: faceBounds(b, face), on: b.id }
    }
    case 'handle':
    case 'axis':
    case 'rotate':
      return null
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
  if (t.kind === 'body' && t.face) {
    const b = findBody(t.id)
    return b ? { target: { kind: 'body', id: t.id, face: t.face }, normal: faceFrame(b, t.face).n } : null
  }
  return null
}

/** Tryck/klick utan pågående operation. tol = snäpptolerans i mm. */
export function tap(hit: Hit | null, tol: number) {
  const { tool, setOp, combining } = tools()

  // Skär ut / Lägg till: trycket väljer verktyget. Utanför alla delar avbryts det.
  if (combining) {
    if (hit?.target.kind !== 'body') {
      tools().setCombining(null)
      return
    }
    const error =
      combining.op === 'joint'
        ? docs().joint(combining.host, hit.target.id)
        : docs().combine(hit.target.id, combining.op, combining.host)
    tools().setCombining(error ? { ...combining, error } : null)
    return
  }

  if (hit?.target.kind === 'handle') {
    const sel = docs().selection
    const target = sel && pushPullTargetOf(sel)
    if (target) beginPushPull(target, hit.point, hit.target.dir)
    return
  }
  if (hit?.target.kind === 'axis') {
    beginAxisMove(hit.target.axis)
    return
  }
  if (hit?.target.kind === 'rotate') {
    beginRotate(hit.target.axis, hit.point)
    return
  }

  if (tool === 'measure') {
    rulerTap(hit, tol)
    return
  }

  if (tool === 'move') {
    const sel = docs().selection
    const selected = sel?.kind === 'body' ? sel.id : null
    const t = hit?.target
    // Inget valt (man kom hit med M): trycket väljer delen man ska flytta.
    if (selected === null && t?.kind === 'body') {
      docs().select({ kind: 'body', id: t.id, face: t.face })
      return
    }
    // Tryck utanför det man flyttar: tillbaka till Välj, som om man tryckt där i Välj.
    if (t?.kind !== 'body' || t.id !== selected) {
      tools().setTool('select')
      tap(hit, tol)
      return
    }
  }

  if (tool === 'select') {
    const t = hit?.target
    docs().select(
      t?.kind === 'body'
        ? { kind: 'body', id: t.id, face: t.face }
        : t?.kind === 'sketch'
          ? { kind: 'sketch', id: t.id }
          : null,
    )
    return
  }

  if (!hit) return

  if (tool === 'rect' || tool === 'circle') {
    const plane = planeForHit(hit)
    if (!plane) return
    const targets = rectTargets(plane.frame, plane.bounds)
    const { point, onTarget } = snapPoint(toLocal2D(plane.frame, hit.point), targets, tol)
    // Första hörnet blir också ett mål, så att man kan dra rakt ut från det.
    const withFirst = { xs: [...targets.xs, point[0]], ys: [...targets.ys, point[1]] }
    setOp({
      kind: 'rect',
      ...(tool === 'circle' && { shape: 'circle' as const }),
      ...plane,
      targets: withFirst,
      first: point,
      current: point,
      onTarget,
    })
    return
  }

  if (tool === 'move') {
    if (hit.target.kind !== 'body') return
    const b = findBody(hit.target.id)
    if (!b) return
    // Inne i ett hål: flytta i golvets riktning.
    const f = faceFrame(b, hit.target.face ?? 'n+')
    setOp(moveOp(b, { ...f, origin: hit.point }, null))
    return
  }

  const pp = pushPullTargetFor(hit)
  if (pp) {
    const others = pp.target.kind === 'body' ? bodies().filter((b) => b.id !== pp.target.id) : bodies()
    setOp({
      kind: 'pushpull',
      ...pp,
      anchor: hit.point,
      grab: 0,
      targets: offsetTargets(others, hit.point, pp.normal),
      distance: 0,
      min: pushPullMinOf(pp.target),
      onTarget: false,
    })
  }
}

/**
 * Dubbeltryck (eller dubbelklick) utan pågående operation. På en del i Välj:
 * delen blir vald och man går till Flytta/vrid. Ett tryck utanför går tillbaka (se tap).
 * False om dubbeltrycket inte betyder något här; då räknas det som ett vanligt tryck.
 */
export function doubleTap(hit: Hit | null): boolean {
  if (tools().tool !== 'select' || hit?.target.kind !== 'body') return false
  docs().select({ kind: 'body', id: hit.target.id, face: hit.target.face })
  tools().setTool('move')
  return true
}

/** Rektangeln en pågående rektangel eller cirkel ritar; för en cirkel kvadraten den ligger inskriven i. */
export function opRect(op: RectOp): Rect {
  return op.shape === 'circle' ? circleRect(op.first, op.current) : rectFromCorners(op.first, op.current)
}

/** Det man gör push/pull på för ett val: skissen, eller delens valda yta. Null om ingen yta är vald. */
export function pushPullTargetOf(sel: Selection): PushPullTarget | null {
  if (sel.kind === 'sketch') return { kind: 'sketch', id: sel.id }
  return sel.face ? { kind: 'body', id: sel.id, face: sel.face } : null
}

/** Var pilen sitter och vart den pekar: mitt på skissen eller ytan, längs normalen. */
export function pushPullAnchor(target: PushPullTarget, doc = docs().doc): { anchor: Vec3; normal: Vec3 } | null {
  if (target.kind === 'sketch') {
    const s = doc.sketches.find((x) => x.id === target.id)
    if (!s) return null
    const { x0, x1, y0, y1 } = s.rect
    return { anchor: toWorld(s.frame, [(x0 + x1) / 2, (y0 + y1) / 2, 0]), normal: s.frame.n }
  }
  const b = resolveBodies(doc).find((x) => x.id === target.id)
  if (!b) return null
  const f = faceFrame(b, target.face)
  const r = faceBounds(b, target.face)
  return { anchor: toWorld(f, [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0]), normal: f.n }
}

/**
 * Startar push/pull utan att man trycker på själva ytan: från pilen eller
 * knappen "Dra ut". Sedan drar man, skriver ett mått eller tar förra djupet.
 * Verktyget byts inte; man är kvar i Välj när operationen är klar.
 * grabDir = pilens riktning där man tog tag, om den är lutad (se arrowDir).
 */
export function beginPushPull(target: PushPullTarget, grabPoint?: Vec3, grabDir?: Vec3) {
  const at = pushPullAnchor(target)
  if (!at) return
  const others = target.kind === 'body' ? bodies().filter((b) => b.id !== target.id) : bodies()
  tools().setOp({
    kind: 'pushpull',
    target,
    ...at,
    grab: grabPoint ? dot(sub(grabPoint, at.anchor), grabDir ?? at.normal) : 0,
    targets: offsetTargets(others, at.anchor, at.normal),
    distance: 0,
    min: pushPullMinOf(target),
    onTarget: false,
  })
}

/** Hur långt in ytan går att trycka (se pushPullMin). En skiss har ingen gräns. */
function pushPullMinOf(target: PushPullTarget): number {
  if (target.kind === 'sketch') return -Infinity
  const b = bodies().find((x) => x.id === target.id)
  return b ? pushPullMin(b, target.face) : -Infinity
}

function moveOp(b: Body, plane: Frame, axis: Axis | null): MoveOp {
  return {
    kind: 'move',
    instanceId: b.id,
    plane,
    axis,
    grab: 0,
    moving: bodyKeyPoints(b).map((p) => toLocal2D(plane, p)),
    // Med Kopia står originalet kvar och går att snäppa mot.
    targets: planeTargets(bodies(), plane, tools().copy ? undefined : b.id),
    delta: [0, 0],
    onTarget: [false, false],
  }
}

/** Plan per världsaxel med u = axeln och u × v = n. */
const AXIS_PLANES: Record<Axis, Omit<Frame, 'origin'>> = {
  0: { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
  1: { u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] },
  2: { u: [0, 0, 1], v: [1, 0, 0], n: [0, 1, 0] },
}

/** Startar en flytt av den valda delen längs en världsaxel (pilarna i Flytta-läget). */
export function beginAxisMove(axis: Axis) {
  const sel = docs().selection
  const b = sel?.kind === 'body' ? findBody(sel.id) : undefined
  if (!b) return
  tools().setOp(moveOp(b, { origin: bodyCenter(b), ...AXIS_PLANES[axis] }, axis))
}

/** Vridning när man drar: steg om 15°, så att 90° och 45° är lätta att träffa. */
export const ANGLE_STEP = 15

/** Plan för vridning runt en världsaxel: n = axeln, u och v de två andra (u × v = n). */
function rotatePlane(axis: Axis, center: Vec3): Frame {
  const { u, v, n } = AXIS_PLANES[axis]
  return { origin: center, u: v, v: n, n: u }
}

/** Startar en vridning av den valda delen runt en världsaxel genom dess mitt. */
export function beginRotate(axis: Axis, at?: Vec3) {
  const sel = docs().selection
  const b = sel?.kind === 'body' ? findBody(sel.id) : undefined
  if (!b) return
  tools().setOp({
    kind: 'rotate',
    instanceId: b.id,
    axis,
    plane: rotatePlane(axis, bodyCenter(b)),
    radius: Math.max(...bodyExtents(b)) * 0.6,
    grab: 0,
    angle: 0,
    ...(at && { at }),
  })
}

/**
 * Under den här vinkeln mellan vridplanet och siktlinjen ses bågen från
 * kanten. Strålen skär då planet så snett att en liten rörelse ger ett stort
 * hopp i vinkel, så pekaren följer i stället bågens tangent (RotateOp.line).
 */
const EDGE_ON = Math.sin((20 * Math.PI) / 180)

/**
 * Linjen att dra längs när bågen ses från kanten, eller undefined om planet
 * syns tillräckligt. Tangenten där man tog tag, lutad så att den syns (arrowDir).
 */
function rotateLine(op: RotateOp, ray: Ray): RotateOp['line'] {
  const { origin: center, n } = op.plane
  const toCamera = sub(ray.origin, center)
  if (Math.abs(dot(n, toCamera)) >= EDGE_ON * length(toCamera)) return undefined
  const from = op.line?.from ?? (op.at && sub(op.at, scale(n, dot(sub(op.at, center), n))))
  const r = from && sub(from, center)
  const radius = r ? length(r) : 0
  if (!from || !r || radius < 1e-6) return undefined
  return { from, dir: dragLine(from, cross(n, scale(r, 1 / radius)), ray), radius }
}

/**
 * Vinkeln i grader som pekaren anger, räknad från u mot v: där strålen skär
 * vridplanet, eller sträckan längs op.line delad med radien. Null om den inte går att räkna.
 */
function angleOf(op: RotateOp, ray: Ray): number | null {
  if (op.line) {
    const s = closestParamOnLine(op.line.from, op.line.dir, ray.origin, ray.dir)
    return s === null ? null : (s / op.line.radius) * (180 / Math.PI)
  }
  const p = intersectPlane(ray, op.plane)
  if (!p || Math.hypot(p[0], p[1]) < 1e-6) return null
  return (Math.atan2(p[1], p[0]) * 180) / Math.PI
}

/** Golvets normal; golvet räknas som en yta, så att man kan mäta höjden från golvet. */
const UP: Vec3 = [0, 1, 0]

/** Punkten för en träff med Mät. Null för det som inte går att mäta till. */
function rulerPointFor(hit: Hit, tol: number): RulerPoint | null {
  const t = hit.target
  if (t.kind === 'ground') return rulerPointOn(bodies(), hit.point, UP, tol)
  if (t.kind === 'sketch') {
    const s = docs().doc.sketches.find((x) => x.id === t.id)
    return s ? { point: hit.point, normal: s.frame.n, snap: null } : null
  }
  if (t.kind !== 'body') return null
  const b = findBody(t.id)
  return b ? rulerPointOn(bodies(), hit.point, t.face ? faceFrame(b, t.face).n : UP, tol) : null
}

/** Tryck med Mät: första punkten, andra punkten, och sedan en ny mätning. */
export function rulerTap(hit: Hit | null, tol: number) {
  const p = hit && rulerPointFor(hit, tol)
  if (!p) return
  const { ruler, setRuler } = tools()
  setRuler(ruler.length === 1 ? [ruler[0]!, p] : [p])
}

/** Muspekaren med Mät: visa vart punkten skulle hamna, och avståndet dit från första punkten. */
export function rulerHoverAt(hit: Hit | null, tol: number) {
  const p = hit ? rulerPointFor(hit, tol) : null
  const prev = tools().rulerHover
  if (JSON.stringify(p) !== JSON.stringify(prev)) tools().setRulerHover(p)
}

/** Muspekaren rör sig utan pågående operation: visa var första hörnet skulle hamna. */
export function hoverAt(hit: Hit | null, tol: number) {
  const { tool, setHoverPoint } = tools()
  if ((tool !== 'rect' && tool !== 'circle') || !hit) {
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
    if (op.shape === 'circle') {
      // Diametern snäpper till rutnätet; punkten på kanten ligger kvar åt det håll pekaren är.
      const [dx, dy] = [p[0] - op.first[0], p[1] - op.first[1]]
      const dist = Math.hypot(dx, dy)
      const d = snapValue(2 * dist, GRID_STEP, [], tol).value
      const [ux, uy] = dist > 1e-9 ? [dx / dist, dy / dist] : [1, 0]
      setOp({ ...op, current: [op.first[0] + (ux * d) / 2, op.first[1] + (uy * d) / 2], onTarget: [false, false] })
      return
    }
    const { point, onTarget } = snapPoint(p, op.targets, tol)
    setOp({ ...op, current: point, onTarget })
    return
  }

  if (op.kind === 'rotate') {
    const a = angleOf(op, ray)
    if (a === null) return
    // Välj det varv som ligger närmast förra vinkeln, så att man kan dra förbi 180°.
    let raw = a - op.grab
    raw -= 360 * Math.round((raw - op.angle) / 360)
    setOp({ ...op, angle: Math.round(raw / ANGLE_STEP) * ANGLE_STEP })
    return
  }

  if (op.kind === 'move' && op.axis !== null) {
    const t = closestParamOnLine(op.plane.origin, dragLine(op.plane.origin, op.plane.u, ray), ray.origin, ray.dir)
    if (t === null) return
    const snapped = snapDelta([t - op.grab, 0], op.moving, op.targets, GRID_STEP, tol)
    setOp({ ...op, delta: [snapped.delta[0], 0], onTarget: [snapped.onTarget[0], false] })
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

  const t = closestParamOnLine(op.anchor, dragLine(op.anchor, op.normal, ray), ray.origin, ray.dir)
  if (t === null) return
  const s = snapValue(t - op.grab, 1, op.targets, tol)
  // Ytan stannar innan den når motsatta sidan.
  const distance = Math.max(s.value, op.min ?? -Infinity)
  setOp({ ...op, distance, onTarget: s.onTarget && distance === s.value })
}

/**
 * Punkten man arbetar vid under en operation: ytans nya läge, delens nya
 * läge eller rektangelns hörn. Snäpptoleransen räknas från kamerans avstånd
 * hit, så att den motsvarar ungefär lika många pixlar var man än är.
 */
export function opFocus(op: Op): Vec3 {
  if (op.kind === 'pushpull') return add(op.anchor, scale(op.normal, op.distance))
  if (op.kind === 'move') return add(op.plane.origin, moveDeltaWorld(op))
  if (op.kind === 'rotate') return op.plane.origin
  return toWorld(op.frame, [op.current[0], op.current[1], 0])
}

/**
 * Nytt tag under en pågående push/pull eller flytt längs en pil (man släppte
 * och trycker igen, var som helst): det man drar i ligger kvar där det är och
 * följer fingret därifrån. False om operationen inte går längs en linje.
 */
export function regrab(ray: Ray): boolean {
  const { op, setOp } = tools()
  if (op?.kind === 'pushpull') {
    const t = closestParamOnLine(op.anchor, dragLine(op.anchor, op.normal, ray), ray.origin, ray.dir)
    if (t !== null) setOp({ ...op, grab: t - op.distance })
    return true
  }
  if (op?.kind === 'move' && op.axis !== null) {
    const t = closestParamOnLine(op.plane.origin, dragLine(op.plane.origin, op.plane.u, ray), ray.origin, ray.dir)
    if (t !== null) setOp({ ...op, grab: t - op.delta[0] })
    return true
  }
  if (op?.kind === 'rotate') {
    // Läget (plan eller linje) väljs när man tar tag och ligger kvar under dragningen, så att vinkeln inte hoppar.
    const next = { ...op, line: rotateLine(op, ray) }
    const a = angleOf(next, ray)
    if (a !== null) setOp({ ...next, grab: a - op.angle })
    return true
  }
  return false
}

/** Förflyttningen i världskoordinater för en flytt-operation. */
export function moveDeltaWorld(op: Extract<Op, { kind: 'move' }>): Vec3 {
  return add(scale(op.plane.u, op.delta[0]), scale(op.plane.v, op.delta[1]))
}

/** Avslutar operationen med nuvarande förhandsvisning. */
export function commit(op: Op | null = tools().op, exprs: { dims?: DimExprs; depth?: string } = {}) {
  if (!op) return
  const d = docs()
  const before = d.doc
  if (op.kind === 'rect') d.addSketch(op.frame, opRect(op), exprs.dims, op.shape, op.on)
  else if (op.kind === 'move' || op.kind === 'rotate') {
    // Man stannar i Flytta, så att man kan flytta längs en axel till. Klar eller Esc går till Välj.
    const step = stepOf(op)
    const source = step && tools().copy ? d.doc.instances.find((i) => i.id === op.instanceId) : undefined
    if (step && source) {
      const [id] = d.addCopies(source.id, [applyStep(source.frame, step, 1)])
      tools().setOp(null)
      if (id) tools().setLastCopy({ sourceId: source.id, step, count: 1, lastId: id })
      return
    }
    if (step?.kind === 'move') d.moveInstance(op.instanceId, step.delta)
    else if (step?.kind === 'rotate') d.rotateInstance(op.instanceId, step.center, step.axis, step.degrees)
  } else {
    if (op.target.kind === 'sketch') d.pushPullSketch(op.target.id, op.distance, exprs.depth, op.mode)
    else d.pushPullBody(op.target.id, op.target.face, op.distance)
    if (op.distance !== 0 && docs().doc !== before) {
      tools().setLastPushPull({ distance: op.distance, ...(exprs.depth && { expr: exprs.depth }) })
      // Efter en utdragning är man i Välj, med delen vald: ett tryck utanför avmarkerar i
      // stället för att börja en ny rektangel. Direkt, inte med setTool: den skulle stänga
      // måttrutan, där man kan skriva ett annat djup.
      if (tools().tool !== 'select') useToolStore.setState({ tool: 'select', hover: null, hoverPoint: null })
    }
  }
  tools().setOp(null)
  // Måttrutan ligger kvar, så att man kan skriva ett annat värde (se amendLast).
  const after = docs()
  if (after.doc !== before) tools().setLastOp({ op, doc: after.doc, selection: after.selection })
}

/** Den senaste operationen, om den fortfarande går att ändra: inget har hänt sedan dess. */
export function amendableOp(): LastOp | null {
  const { lastOp } = tools()
  const d = docs()
  if (!lastOp || d.doc !== lastOp.doc) return null
  return JSON.stringify(d.selection) === JSON.stringify(lastOp.selection) ? lastOp : null
}

/**
 * Gör om senaste operationen med de inskrivna måtten: ångrar den och
 * avslutar den igen, som om man skrivit måtten medan den pågick. Tomma fält
 * behåller förra värdet. Går ett mått inte att beräkna ligger allt kvar som
 * det var. Returnerar false då, eller om det inte finns något att ändra.
 */
export function amendLast(): boolean {
  const last = amendableOp()
  if (!last) return false
  const measure = tools().measure
  // Inget inskrivet: bara stäng rutan.
  if (measure.every((m) => m.trim() === '')) {
    dismissLast()
    return true
  }
  docs().undo()
  tools().setOp(last.op)
  if (applyMeasure()) return true
  // Återställ: operationen avslutad som förut, med det man skrev kvar i fältet.
  tools().setOp(null)
  docs().redo()
  docs().select(last.selection)
  tools().setLastOp({ ...last, doc: docs().doc })
  tools().setMeasure(1, measure[1])
  tools().setMeasure(0, measure[0])
  return false
}

/** Stänger måttrutan efter en avslutad operation utan att ändra något. */
export function dismissLast() {
  tools().setLastOp(null)
}

/**
 * Krysset i måttrutan efter en avslutad operation: ångrar den, som Avbryt
 * gör medan den pågår. Samma knapp på samma ställe ska göra samma sak.
 */
export function undoLast() {
  if (!amendableOp()) return
  tools().setLastOp(null)
  docs().undo()
}

/** Vad en flytt eller vridning gör, som ett steg som går att upprepa. Null om den inte gör något. */
export function stepOf(op: MoveOp | RotateOp): CopyStep | null {
  if (op.kind === 'rotate')
    return op.angle % 360 === 0
      ? null
      : { kind: 'rotate', center: op.plane.origin, axis: op.plane.n, degrees: op.angle }
  return op.delta[0] === 0 && op.delta[1] === 0 ? null : { kind: 'move', delta: moveDeltaWorld(op) }
}

/** Framen efter times steg. */
export function applyStep(f: Frame, step: CopyStep, times: number): Frame {
  return step.kind === 'move'
    ? { ...f, origin: add(f.origin, scale(step.delta, times)) }
    : rotateFrame(f, step.center, step.axis, step.degrees * times)
}

/** Den senaste kopieringen, om man fortfarande kan ändra antalet: sista kopian finns och är vald. */
export function extendableCopy(): LastCopy | null {
  const { lastCopy } = tools()
  const sel = docs().selection
  if (!lastCopy || sel?.kind !== 'body' || sel.id !== lastCopy.lastId) return null
  return docs().doc.instances.some((i) => i.id === lastCopy.lastId) ? lastCopy : null
}

/**
 * Gör raden kopior total lång, med samma steg som den senaste kopian (som
 * "5x" i SketchUp). Går bara att öka; färre får man med Ångra.
 * Returnerar false om det inte går.
 */
export function extendCopies(total: number): boolean {
  const last = extendableCopy()
  const n = Math.round(total)
  if (!last || !(n > last.count) || n > MAX_COPIES) return false
  const source = docs().doc.instances.find((i) => i.id === last.sourceId)
  if (!source) return false
  const frames = Array.from({ length: n - last.count }, (_, i) =>
    applyStep(source.frame, last.step, last.count + 1 + i),
  )
  const ids = docs().addCopies(source.id, frames)
  tools().setLastCopy({ ...last, count: n, lastId: ids.at(-1)! })
  tools().setMeasure(0, '')
  return true
}

/** Slår av eller på Kopia. Under en flytt blir originalet ett mål att snäppa mot när det står kvar. */
export function setCopy(on: boolean) {
  tools().setCopy(on)
  const op = tools().op
  if (op?.kind === 'move')
    tools().setOp({ ...op, targets: planeTargets(bodies(), op.plane, on ? undefined : op.instanceId) })
}

/**
 * Avslutar en push/pull med samma djup som förra gången (som dubbelklick i
 * SketchUp). Var förra djupet ett uttryck följer den nya delen också parametern.
 * Returnerar false om det inte finns något förra djup.
 */
export function repeatLastPushPull(): boolean {
  const { op, lastPushPull } = tools()
  if (op?.kind !== 'pushpull' || !lastPushPull) return false
  if (lastPushPull.distance < (op.min ?? -Infinity)) return false
  commit({ ...op, distance: lastPushPull.distance }, { depth: lastPushPull.expr })
  return true
}

export function cancel() {
  tools().setOp(null)
}

/** Aktuella mått för förhandsvisningen: [längd, bredd] för rektangel, annars [avstånd]. */
export function liveMeasure(op: Op): number[] {
  if (op.kind === 'rect' && op.shape === 'circle') return [rectSize(opRect(op))[0]]
  if (op.kind === 'rect') return [Math.abs(op.current[0] - op.first[0]), Math.abs(op.current[1] - op.first[1])]
  if (op.kind === 'rotate') return [op.angle]
  if (op.kind === 'move') return [op.axis !== null ? op.delta[0] : Math.hypot(op.delta[0], op.delta[1])]
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
  const { params } = docs().doc
  if (!op) {
    // Efter en avslutad operation: gör om den med de nya måtten.
    if (amendableOp()) return amendLast()
    // Efter en kopia: fältet är antalet kopior.
    const r = evaluateIn(measure[0], params)
    return r.ok && extendCopies(r.value)
  }

  const read = (text: string, live: number): number | null => {
    if (text.trim() === '') return live
    const r = evaluateIn(text, params)
    return r.ok ? r.value : null
  }
  const exprOf = (text: string) => (text.trim() !== '' && !isConstant(text) ? text.trim() : undefined)
  const signed = (text: string, value: number, liveSign: number) =>
    /^[-−]/.test(text.trim()) ? value : (liveSign || 1) * Math.abs(value)

  if (op.kind === 'rect' && op.shape === 'circle') {
    const d = read(measure[0], liveMeasure(op)[0]!)
    if (d === null) return false
    const e = exprOf(measure[0])
    // Diametern styr profilens u; v följer med (se keepRound).
    const dims: DimExprs = e ? { u: { expr: e, anchor: 'min' } } : {}
    commit({ ...op, current: [op.first[0] + Math.abs(d) / 2, op.first[1]] }, { dims })
    return true
  }

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

  if (op.kind === 'rotate') {
    commit({ ...op, angle: signed(measure[0], value, Math.sign(op.angle)) })
    return true
  }

  if (op.kind === 'move' && op.axis !== null) {
    commit({ ...op, delta: [signed(measure[0], value, Math.sign(op.delta[0])), 0] })
    return true
  }

  if (op.kind === 'move') {
    const len = length([op.delta[0], op.delta[1], 0])
    if (len === 0) return false
    const k = value / len
    commit({ ...op, delta: [op.delta[0] * k, op.delta[1] * k] })
    return true
  }

  const distance = signed(measure[0], value, Math.sign(op.distance))
  if (distance < (op.min ?? -Infinity)) return false
  commit({ ...op, distance }, { depth: exprOf(measure[0]) })
  return true
}
