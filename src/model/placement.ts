import { evaluate } from './expr'
import { toWorld } from './frame'
import type { Instance, PartDef, Vec3, WorldAxis } from './types'
import { add } from './vec'

export const WORLD_AXES: readonly WorldAxis[] = ['x', 'y', 'z']
const INDEX: Record<WorldAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

/**
 * Delens hörn närmast origo i världskoordinater: minsta x, y och z.
 * Alla delar ligger längs världens axlar (skisser görs på golvet eller på
 * andra delars sidor), så lådan runt delen är delen själv.
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
