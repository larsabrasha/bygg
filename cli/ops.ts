import { evaluate, isConstant } from '../src/model/expr'
import { bodyCenter } from '../src/model/geometry'
import { limitError, LIMITS } from '../src/model/limits'
import { isKnownMaterial, MATERIAL_SPECS } from '../src/model/materials'
import { paramScope } from '../src/model/params'
import { minCorner, WORLD_AXES } from '../src/model/placement'
import { resolveBodies } from '../src/model/resolve'
import type { Axis, Frame, Instance, ModelDocument, Paint, Rect, Vec3, WorldAxis } from '../src/model/types'
import { useDocumentStore, type PartPatch } from '../src/store/documentStore'
import { useLibraryStore } from '../src/store/libraryStore'

/**
 * Ändringar av en modell som en lista av operationer (JSON), för CLI:t. De körs med
 * appens egen store (documentStore), så att tappar, verktyg, parametrar och gränserna
 * (model/limits) fungerar precis som när man ritar. Allt eller inget: stoppas en
 * operation ändras modellen inte alls.
 */

/** Så många operationer får en ändring ha. */
export const MAX_OPS = 500
/** Så många kopior får en copy-operation göra (som Kopia i appen). */
export const MAX_COPY_COUNT = 200

type Value = number | string
type Json = Record<string, unknown>

export type EditResult =
  | { ok: true; doc: ModelDocument; refs: Record<string, string>; changed: number }
  | { ok: false; error: string; index?: number }

class OpError extends Error {}
const fail = (msg: string): never => {
  throw new OpError(msg)
}

const isObj = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x)
const AXIS_INDEX: Record<WorldAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

/** Operationerna och deras fält: allt annat är ett skrivfel och stoppar ändringen. */
const FIELDS: Record<string, readonly string[]> = {
  box: ['name', 'size', 'at', 'material', 'grain', 'thickness', 'paint', 'ref'],
  cylinder: ['name', 'diameter', 'length', 'axis', 'at', 'material', 'grain', 'paint', 'ref'],
  copy: ['id', 'by', 'at', 'count', 'ref', 'refs'],
  move: ['id', 'by', 'to'],
  position: ['id', 'x', 'y', 'z'],
  size: ['id', 'x', 'y', 'z'],
  rotate: ['id', 'axis', 'degrees'],
  mirror: ['id', 'axis'],
  set: ['id', 'name', 'material', 'grain', 'thickness', 'paint'],
  unique: ['id'],
  delete: ['id'],
  subtract: ['tool', 'host'],
  add: ['tool', 'host'],
  joint: ['host', 'into'],
  detach: ['id'],
  param: ['name', 'expr'],
  deleteParam: ['name'],
  stock: ['kerf', 'allowance'],
}

export const OP_NAMES = Object.keys(FIELDS)

const s = () => useDocumentStore.getState()

/** Senaste meddelandet från storen (varför en ändring stoppades), och töm listan. */
function takeNotice(): string | undefined {
  const lib = useLibraryStore.getState()
  const text = lib.notices.at(-1)?.text
  useLibraryStore.setState({ notices: [] })
  return text
}

export function applyOps(doc: ModelDocument, ops: unknown): EditResult {
  if (!Array.isArray(ops)) return { ok: false, error: 'Operationerna ska vara en JSON-lista' }
  if (ops.length === 0) return { ok: false, error: 'Inga operationer' }
  if (ops.length > MAX_OPS) return { ok: false, error: `Högst ${MAX_OPS} operationer åt gången` }
  s().load(doc)
  useLibraryStore.setState({ notices: [] })
  const refs: Record<string, string> = {}
  let changed = 0
  for (const [index, op] of ops.entries()) {
    try {
      const before = s().doc
      run(op, refs)
      if (s().doc !== before) changed++
    } catch (e) {
      if (!(e instanceof OpError)) throw e
      return { ok: false, error: e.message, index }
    }
  }
  // Storen stoppar bara det som växer; en modell som redan var för stor sparas inte.
  const tooBig = limitError(s().doc)
  if (tooBig) return { ok: false, error: tooBig }
  return { ok: true, doc: s().doc, refs, changed }
}

function run(op: unknown, refs: Record<string, string>) {
  if (!isObj(op) || typeof op.op !== 'string') fail('Varje operation ska vara ett objekt med "op"')
  const o = op as Json & { op: string }
  const fields = FIELDS[o.op] ?? fail(`Okänd operation "${o.op}". Finns: ${OP_NAMES.join(', ')}`)
  for (const k of Object.keys(o)) if (k !== 'op' && !fields.includes(k)) fail(`"${o.op}" har inget fält "${k}"`)
  const id = (key = 'id') => resolveId(o[key], refs, key)
  const check = <T>(result: T, ok: (r: T) => boolean): T => {
    if (!ok(result)) fail(takeNotice() ?? `"${o.op}" gick inte att göra`)
    return result
  }
  const checkError = (error: string | null) => {
    if (error) fail(takeNotice() ?? error)
  }

  switch (o.op) {
    case 'box': {
      const size = vec(o.size, 'size')
      const at = o.at === undefined ? [0, 0, 0] : vec(o.at, 'at')
      const [sx, sy, sz] = size.map((v, k) => positive(v, `size[${k}]`))
      const [ax, ay, az] = at.map((v, k) => num(v, `at[${k}]`))
      // Ritad på golvet (som i appen) och utdragen uppåt: u = +x, v = −z, n = +y.
      const frame: Frame = { origin: [ax!, ay!, az! + sz!], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] }
      const rect: Rect = { x0: 0, y0: 0, x1: sx!, y1: sz! }
      const inst = extrude(frame, rect, sy!, undefined, check)
      finishPart(inst, o)
      // Mått och läge som uttryck sparas som uttryck, så att de följer parametrarna.
      WORLD_AXES.forEach((axis, k) => {
        if (isExpr(size[k])) checkError(s().setExtent(inst, localAxis(inst, axis), String(size[k])))
      })
      WORLD_AXES.forEach((axis, k) => {
        if (isExpr(at[k])) checkError(s().setPosition(inst, axis, String(at[k])))
      })
      if (o.ref !== undefined) refs[ref(o.ref)] = inst
      return
    }
    case 'cylinder': {
      const d = positive(o.diameter, 'diameter')
      const l = positive(o.length, 'length')
      const axis = worldAxis(o.axis ?? 'y', 'axis')
      const [ax, ay, az] = (o.at === undefined ? [0, 0, 0] : vec(o.at, 'at')).map((v, k) => num(v, `at[${k}]`))
      // Profilen i planet tvärs axeln, med hörnet närmast origo i at.
      const frames: Record<WorldAxis, Frame> = {
        x: { origin: [ax!, ay!, az!], u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] },
        y: { origin: [ax!, ay!, az! + d], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] },
        z: { origin: [ax!, ay!, az!], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
      }
      const inst = extrude(frames[axis], { x0: 0, y0: 0, x1: d, y1: d }, l, 'circle', check)
      finishPart(inst, o)
      if (o.ref !== undefined) refs[ref(o.ref)] = inst
      return
    }
    case 'copy': {
      const source = id()
      const count = o.count === undefined ? 1 : Number(o.count)
      if (!Number.isInteger(count) || count < 1 || count > MAX_COPY_COUNT)
        fail(`count ska vara ett heltal 1–${MAX_COPY_COUNT}`)
      const inst = instance(source)
      let step: Vec3
      if (o.at !== undefined) {
        if (count !== 1) fail('"at" går bara med count 1; använd "by" för flera')
        const at = vec(o.at, 'at').map((v, k) => num(v, `at[${k}]`))
        const corner = minCorner(inst, def(inst))
        step = [0, 1, 2].map((k) => at[k]! - corner[k]!) as Vec3
      } else step = vec(o.by, 'by').map((v, k) => num(v, `by[${k}]`)) as Vec3
      const frames = Array.from({ length: count }, (_, i) => ({
        ...inst.frame,
        origin: [0, 1, 2].map((k) => inst.frame.origin[k]! + step[k]! * (i + 1)) as Vec3,
      }))
      const ids = check(s().addCopies(source, frames), (r) => r.length === count)
      if (o.ref !== undefined) refs[ref(o.ref)] = ids.at(-1)!
      if (o.refs !== undefined) {
        if (!Array.isArray(o.refs) || o.refs.length !== count) fail('"refs" ska vara en lista med ett namn per kopia')
        ;(o.refs as unknown[]).forEach((r, i) => (refs[ref(r)] = ids[i]!))
      }
      return
    }
    case 'move': {
      const target = id()
      const inst = instance(target)
      let delta: Vec3
      if (o.to !== undefined) {
        const to = vec(o.to, 'to').map((v, k) => num(v, `to[${k}]`))
        const corner = minCorner(inst, def(inst))
        delta = [0, 1, 2].map((k) => to[k]! - corner[k]!) as Vec3
      } else delta = vec(o.by, 'by').map((v, k) => num(v, `by[${k}]`)) as Vec3
      const before = s().doc
      s().moveInstance(target, delta)
      if (s().doc === before && delta.some((d) => d !== 0)) fail(takeNotice() ?? 'Delen gick inte att flytta')
      return
    }
    case 'position':
    case 'size': {
      const target = id()
      const axes = WORLD_AXES.filter((a) => o[a] !== undefined)
      if (axes.length === 0) fail(`"${o.op}" behöver minst ett av x, y och z`)
      for (const axis of axes) {
        const text = valueText(o[axis], axis)
        checkError(
          o.op === 'size' ? s().setExtent(target, localAxis(target, axis), text) : s().setPosition(target, axis, text),
        )
      }
      return
    }
    case 'rotate': {
      const target = id()
      const axis = worldAxis(o.axis, 'axis')
      const degrees = num(o.degrees, 'degrees')
      const body = resolveBodies(s().doc).find((b) => b.id === target)!
      const v: Vec3 = [0, 0, 0]
      v[AXIS_INDEX[axis]] = 1
      const before = s().doc
      s().rotateInstance(target, bodyCenter(body), v, degrees)
      if (s().doc === before && degrees % 360 !== 0) fail(takeNotice() ?? 'Delen gick inte att vrida')
      return
    }
    case 'mirror': {
      const target = id()
      const axis = worldAxis(o.axis, 'axis')
      const before = s().doc
      s().mirrorInstances([target], axis)
      if (s().doc === before) fail(takeNotice() ?? 'Delen gick inte att spegla')
      return
    }
    case 'set': {
      const target = id()
      const patch: PartPatch = {}
      if (o.name !== undefined) patch.name = name(o.name)
      if (o.material !== undefined) patch.material = material(o.material)
      if (o.grain !== undefined) patch.grainAxis = localAxis(target, worldAxis(o.grain, 'grain'))
      if (o.thickness !== undefined) patch.thicknessAxis = localAxis(target, worldAxis(o.thickness, 'thickness'))
      if (o.paint !== undefined) patch.paint = paint(o.paint)
      if (Object.keys(patch).length === 0) fail('"set" behöver något av name, material, grain, thickness, paint')
      updatePart(target, patch)
      return
    }
    case 'unique':
      s().makeUnique(id())
      return
    case 'delete':
      s().select({ kind: 'body', id: id() })
      s().deleteSelection()
      return
    case 'subtract':
    case 'add':
      checkError(s().combine(id('tool'), o.op, id('host')))
      return
    case 'joint':
      checkError(s().joint(id('host'), id('into')))
      return
    case 'detach':
      s().detach(id())
      return
    case 'param': {
      const n = name(o.name)
      const expr = valueText(o.expr, 'expr')
      const existing = s().doc.params.find((p) => p.name === n)
      const pid = existing?.id ?? check(s().addParam(), (r) => r !== null)!
      const error = s().updateParam(pid, { name: n, expr })
      if (error) {
        // En ny parameter som inte gick att sätta ska inte bli kvar som "mått1".
        if (!existing) s().deleteParam(pid)
        fail(takeNotice() ?? `${n}: ${error}`)
      }
      return
    }
    case 'deleteParam': {
      const p = s().doc.params.find((x) => x.name === o.name) ?? fail(`Parametern "${String(o.name)}" finns inte`)
      if (!s().deleteParam(p.id)) fail(`"${p.name}" används i ett mått och går inte att ta bort`)
      return
    }
    case 'stock': {
      const patch: { kerf?: number; lengthAllowance?: number } = {}
      if (o.kerf !== undefined) patch.kerf = nonNegative(o.kerf, 'kerf')
      if (o.allowance !== undefined) patch.lengthAllowance = nonNegative(o.allowance, 'allowance')
      s().setStockOptions(patch)
      return
    }
  }
}

function extrude(
  frame: Frame,
  rect: Rect,
  depth: number,
  shape: 'circle' | undefined,
  check: <T>(r: T, ok: (r: T) => boolean) => T,
): string {
  const sketch = check(s().addSketch(frame, rect, undefined, shape), (r) => r !== null)!
  return check(s().pushPullSketch(sketch, depth), (r) => r !== null)!
}

/** Ändrar delen. Stoppas ändringen av gränserna står skälet i felet. */
function updatePart(inst: string, patch: PartPatch) {
  const before = s().doc
  s().updatePart(inst, patch)
  const notice = s().doc === before ? takeNotice() : undefined
  if (notice) fail(notice)
}

function finishPart(inst: string, o: Json) {
  const patch: PartPatch = {}
  if (o.name !== undefined) patch.name = name(o.name)
  if (o.material !== undefined) patch.material = material(o.material)
  if (o.grain !== undefined) patch.grainAxis = localAxis(inst, worldAxis(o.grain, 'grain'))
  if (o.thickness !== undefined) patch.thicknessAxis = localAxis(inst, worldAxis(o.thickness, 'thickness'))
  if (o.paint !== undefined) patch.paint = paint(o.paint)
  if (Object.keys(patch).length) updatePart(inst, patch)
}

/** Id för en kopia: en ref från tidigare i listan, ett id, början på ett id (minst 4 tecken) eller ett namn. */
export function resolveId(x: unknown, refs: Record<string, string>, key = 'id'): string {
  if (typeof x !== 'string' || !x.trim()) return fail(`"${key}" saknas`)
  const q = x.trim()
  if (refs[q]) return refs[q]
  const { instances, defs } = s().doc
  if (instances.some((i) => i.id === q)) return q
  if (q.length >= 4) {
    const byPrefix = instances.filter((i) => i.id.startsWith(q))
    if (byPrefix.length === 1) return byPrefix[0]!.id
    if (byPrefix.length > 1) fail(`"${q}" passar på ${byPrefix.length} delar; skriv fler tecken av id:t`)
  }
  const names = new Map(defs.map((d) => [d.id, d.name]))
  const byName = instances.filter((i) => names.get(i.defId) === q)
  if (byName.length === 1) return byName[0]!.id
  if (byName.length > 1) fail(`${byName.length} delar heter "${q}" (länkade kopior); använd id`)
  return fail(`Ingen del "${q}"`)
}

function instance(id: string): Instance {
  return s().doc.instances.find((i) => i.id === id)!
}

function def(inst: Instance) {
  return s().doc.defs.find((d) => d.id === inst.defId)!
}

/** Den av kopians axlar (u, v, n) som ligger längs världsaxeln. */
export function localAxis(inst: string | Instance, axis: WorldAxis): Axis {
  const { frame } = typeof inst === 'string' ? instance(inst) : inst
  const k = AXIS_INDEX[axis]
  const found = (['u', 'v', 'n'] as const).find((a) => Math.abs(Math.abs(frame[a][k]!) - 1) < 1e-6)
  return found ?? fail(`Delen står snett; ingen av dess axlar ligger längs ${axis}`)
}

function worldAxis(x: unknown, key: string): WorldAxis {
  return x === 'x' || x === 'y' || x === 'z' ? x : fail(`"${key}" ska vara "x", "y" eller "z"`)
}

function vec(x: unknown, key: string): Value[] {
  if (!Array.isArray(x) || x.length !== 3 || !x.every((v) => typeof v === 'number' || typeof v === 'string'))
    fail(`"${key}" ska vara [x, y, z] (tal eller uttryck)`)
  return x as Value[]
}

const isExpr = (v: Value | undefined) => typeof v === 'string' && !isConstant(v)

/** Ett tal eller uttryck, beräknat med modellens parametrar. */
function num(v: unknown, key: string): number {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) fail(`"${key}" är inte ett tal`)
    return v
  }
  if (typeof v !== 'string') return fail(`"${key}" ska vara ett tal eller ett uttryck`)
  if (v.length > LIMITS.exprLength) fail(`"${key}" är längre än ${LIMITS.exprLength} tecken`)
  const scope = paramScope(s().doc.params)
  const r = evaluate(v, (n) => scope.get(n))
  return r.ok ? r.value : fail(`"${key}": ${r.error}`)
}

function positive(v: unknown, key: string): number {
  const n = num(v, key)
  return n >= 1 ? n : fail(`"${key}" ska vara minst 1 mm`)
}

function nonNegative(v: unknown, key: string): number {
  const n = num(v, key)
  return n >= 0 && n <= 1000 ? n : fail(`"${key}" ska vara 0–1000 mm`)
}

function valueText(v: unknown, key: string): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'string' && v.trim()) return v
  return fail(`"${key}" ska vara ett tal eller ett uttryck`)
}

function name(x: unknown): string {
  if (typeof x !== 'string' || !x.trim()) fail('"name" ska vara en text')
  return (x as string).trim()
}

function ref(x: unknown): string {
  if (typeof x !== 'string' || !x.trim()) fail('"ref" ska vara en text')
  return (x as string).trim()
}

/** Ett material efter id eller namn ("ek", "Björkplywood"), inbyggt eller eget. */
export function material(x: unknown): string {
  if (typeof x !== 'string' || !x.trim()) return fail('"material" ska vara en text')
  const q = x.trim()
  if (isKnownMaterial(q)) return q
  const lower = q.toLocaleLowerCase('sv')
  const hit = MATERIAL_SPECS.find((m) => m.name.toLocaleLowerCase('sv') === lower)
  if (hit) return hit.id
  return fail(`Okänt material "${q}". Se bygg materials`)
}

function paint(x: unknown): Paint | undefined {
  if (x === null) return undefined
  const [color, code] = typeof x === 'string' ? [x, undefined] : isObj(x) ? [x.color, x.code] : [undefined, undefined]
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
    fail('"paint" ska vara "#rrggbb", { "color": "#rrggbb", "code": "NCS …" } eller null')
  const c = typeof code === 'string' && code.trim() ? code.trim() : undefined
  return { color: (color as string).toLowerCase(), ...(c && { code: c }) }
}
