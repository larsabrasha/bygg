import { blankBox, relativeFrame } from './combine'
import type { Body, Instance, ModelDocument, PartDef, ToolShape } from './types'

const cache = new WeakMap<ModelDocument, Body[]>()

/**
 * Verktygen per form: varje kopia med combine blir ett ToolShape i sin värds
 * form, i formens koordinater. Verktyg på verktyg räknas inte (se combineError).
 */
function toolsByDef(doc: ModelDocument, defs: Map<string, PartDef>): Map<string, ToolShape[]> {
  const byId = new Map<string, Instance>(doc.instances.map((i) => [i.id, i]))
  const out = new Map<string, ToolShape[]>()
  const push = (on: Instance, op: ToolShape['op'], t: Instance, d: PartDef) => {
    const list = out.get(on.defId) ?? []
    list.push({
      op,
      profile: d.profile,
      ...(d.shape && { shape: d.shape }),
      z0: d.z0,
      z1: d.z1,
      frame: relativeFrame(on.frame, t.frame),
    })
    out.set(on.defId, list)
  }
  for (const t of doc.instances) {
    if (!t.combine) continue
    const host = byId.get(t.combine.host)
    const d = defs.get(t.defId)
    if (!host || host.combine || !d) continue
    // En tapp: tillägg på värden och urtag i delen den går in i.
    push(host, t.combine.op === 'subtract' ? 'subtract' : 'add', t, d)
    const into = t.combine.op === 'joint' && t.combine.into ? byId.get(t.combine.into) : undefined
    if (into && !into.combine) push(into, 'subtract', t, d)
  }
  return out
}

/**
 * Slår ihop varje kopia med sin form. Cachas per dokument, så samma dokument
 * ger samma array (stabilt för React-selektorer).
 */
export function resolveBodies(doc: ModelDocument): Body[] {
  const hit = cache.get(doc)
  if (hit) return hit
  const defs = new Map(doc.defs.map((d) => [d.id, d]))
  const tools = toolsByDef(doc, defs)
  const blanks = new Map([...tools].map(([id, list]) => [id, blankBox(defs.get(id)!, list)]))
  const bodies: Body[] = []
  for (const inst of doc.instances) {
    const d = defs.get(inst.defId)
    if (!d) continue
    const own = tools.get(d.id)
    const blank = blanks.get(d.id)
    bodies.push({
      id: inst.id,
      defId: d.id,
      name: d.name,
      material: d.material,
      grainAxis: d.grainAxis,
      thicknessAxis: d.thicknessAxis,
      frame: inst.frame,
      profile: d.profile,
      ...(d.shape && { shape: d.shape }),
      z0: d.z0,
      z1: d.z1,
      ...(inst.combine && { tool: inst.combine }),
      ...(own && { tools: own }),
      ...(blank && { blank }),
    })
  }
  cache.set(doc, bodies)
  return bodies
}

/** Antal kopior per form. */
export function instanceCounts(doc: ModelDocument): Map<string, number> {
  const counts = new Map<string, number>()
  for (const i of doc.instances) counts.set(i.defId, (counts.get(i.defId) ?? 0) + 1)
  return counts
}
