import type { Body, ModelDocument } from './types'

const cache = new WeakMap<ModelDocument, Body[]>()

/**
 * Slår ihop varje kopia med sin form. Cachas per dokument, så samma dokument
 * ger samma array (stabilt för React-selektorer).
 */
export function resolveBodies(doc: ModelDocument): Body[] {
  const hit = cache.get(doc)
  if (hit) return hit
  const defs = new Map(doc.defs.map((d) => [d.id, d]))
  const bodies: Body[] = []
  for (const inst of doc.instances) {
    const d = defs.get(inst.defId)
    if (!d) continue
    bodies.push({
      id: inst.id,
      defId: d.id,
      name: d.name,
      material: d.material,
      grainAxis: d.grainAxis,
      thicknessAxis: d.thicknessAxis,
      frame: inst.frame,
      profile: d.profile,
      z0: d.z0,
      z1: d.z1,
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
