import { evaluate } from './expr'
import { toWorld } from './frame'
import type { Instance, PartDef, Vec3, WorldAxis } from './types'
import { add } from './vec'

export const WORLD_AXES: readonly WorldAxis[] = ['x', 'y', 'z']
const INDEX: Record<WorldAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

/**
 * Delens hörn närmast origo i världskoordinater: minsta x, y och z.
 * För en del som ligger längs världens axlar är det ett av delens hörn;
 * för en snett vriden del är det hörnet på lådan runt den.
 */
export function minCorner(inst: Instance, def: PartDef): Vec3 {
  const { profile: r, z0, z1 } = def
  const min: Vec3 = [Infinity, Infinity, Infinity]
  for (const x of [r.x0, r.x1])
    for (const y of [r.y0, r.y1])
      for (const z of [z0, z1]) {
        const p = toWorld(inst.frame, [x, y, z])
        for (const i of [0, 1, 2] as const) min[i] = Math.min(min[i], p[i])
      }
  return min
}

/** Flyttar kopian så att hörnet närmast origo hamnar på value längs axeln. */
export function placeAlong(inst: Instance, def: PartDef, axis: WorldAxis, value: number): Instance {
  const i = INDEX[axis]
  const delta = value - minCorner(inst, def)[i]
  if (delta === 0) return inst
  const d: Vec3 = [0, 0, 0]
  d[i] = delta
  return { ...inst, frame: { ...inst.frame, origin: add(inst.frame.origin, d) } }
}

/** Placerar kopior vars läge styrs av uttryck. Uttryck som inte går att beräkna lämnas orörda. */
export function applyPositions(
  instances: readonly Instance[],
  defs: readonly PartDef[],
  scope: Map<string, number>,
): Instance[] {
  const byId = new Map(defs.map((d) => [d.id, d]))
  return instances.map((inst) => {
    const def = inst.pos && byId.get(inst.defId)
    if (!def || !inst.pos) return inst
    let out = inst
    for (const axis of WORLD_AXES) {
      const expr = inst.pos[axis]
      if (!expr) continue
      const r = evaluate(expr, (n) => scope.get(n))
      if (r.ok) out = placeAlong(out, def, axis, r.value)
    }
    return out
  })
}

/** Kopian utan uttryck för de axlar där den flyttats för hand. Handpåläggning vinner. */
export function withoutPos(inst: Instance, axes: readonly WorldAxis[]): Instance {
  if (!inst.pos || !axes.some((a) => inst.pos?.[a])) return inst
  const pos = { ...inst.pos }
  for (const a of axes) delete pos[a]
  const { pos: _old, ...rest } = inst
  void _old
  return Object.keys(pos).length ? { ...rest, pos } : rest
}

/** Uttrycket som en faktor i "k * …": inom parentes om det är en summa eller börjar med minus. */
function factor(expr: string): string {
  const e = expr.trim()
  return isTerm(e) || (!/^[-−]/.test(e) && !topLevelSum(e)) ? e : `(${e})`
}

/** Har ett + eller − utanför alla parenteser (inte ett minustecken först). */
function topLevelSum(e: string): boolean {
  let depth = 0
  return [...e].some((c, i) => {
    depth += c === '(' ? 1 : c === ')' ? -1 : 0
    return depth === 0 && i > 0 && /[+\-−]/.test(c)
  })
}

/** Ett namn, ett tal eller något inom en parentes som omsluter allt. */
function isTerm(expr: string): boolean {
  const e = expr.trim()
  if (/^[\p{L}_][\p{L}\d_]*$|^\d+([.,]\d+)?$/u.test(e)) return true
  if (!e.startsWith('(') || !e.endsWith(')')) return false
  let depth = 0
  return [...e].every((c, i) => {
    depth += c === '(' ? 1 : c === ')' ? -1 : 0
    return depth > 0 || i === e.length - 1
  })
}

/**
 * Läget för kopia nummer k i en rad längs axis med steget step (ett uttryck): originalets
 * läge plus k steg. Originalets uttryck följer med, också längs de andra axlarna; saknas
 * det längs radens axel används talet där originalet står. Så följer raden parametrarna.
 */
export function rowPos(
  source: Instance,
  def: PartDef,
  row: { axis: WorldAxis; step: string },
  k: number,
): Partial<Record<WorldAxis, string>> {
  const corner = minCorner(source, def)[INDEX[row.axis]]
  const base = source.pos?.[row.axis] ?? String(Math.round(corner * 1000) / 1000 + 0)
  // Minus först dras ut bara när det gäller hela steget: "-(a + b)", men inte "-a + b".
  const trimmed = row.step.trim()
  const negative = /^[-−]/.test(trimmed) && isTerm(trimmed.slice(1))
  const step = negative ? trimmed.slice(1) : trimmed
  const steps = k === 1 ? (/^[-−]/.test(step) ? `(${step})` : step) : `${k} * ${factor(step)}`
  const expr = base === '0' ? (negative ? `-${steps}` : steps) : `${base} ${negative ? '-' : '+'} ${steps}`
  return { ...source.pos, [row.axis]: expr }
}
