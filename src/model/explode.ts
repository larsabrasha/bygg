import { bodyCenter } from './geometry'
import type { Body, Vec3 } from './types'
import { add, scale, sub } from './vec'

/**
 * Sprängskissen: hur långt varje del flyttas. Bort från modellens mitt (mitten
 * av lådan runt delarnas mittpunkter), amount gånger avståndet dit. Med 1 står
 * delarna dubbelt så långt från mitten som i modellen. En del mitt i modellen
 * står kvar. Ett verktyg (en tapp) följer med delen det sitter på.
 */
export function explodeOffsets(bodies: readonly Body[], amount: number): Map<string, Vec3> {
  const out = new Map<string, Vec3>()
  const parts = bodies.filter((b) => !b.tool)
  if (parts.length === 0) return out
  const centers = parts.map(bodyCenter)
  const lo = [0, 1, 2].map((k) => Math.min(...centers.map((c) => c[k]!)))
  const hi = [0, 1, 2].map((k) => Math.max(...centers.map((c) => c[k]!)))
  const middle: Vec3 = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2]
  parts.forEach((b, i) => out.set(b.id, scale(sub(centers[i]!, middle), amount)))
  for (const b of bodies) if (b.tool) out.set(b.id, out.get(b.tool.host) ?? [0, 0, 0])
  return out
}

/** Var en del hamnar i sprängskissen: dess mitt plus förskjutningen. */
export function explodedCenter(body: Body, offsets: ReadonlyMap<string, Vec3>): Vec3 {
  return add(bodyCenter(body), offsets.get(body.id) ?? [0, 0, 0])
}
