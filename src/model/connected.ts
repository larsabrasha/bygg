import { toolTargets } from './combine'
import { bodiesBox } from './geometry'
import { contact, CONTACT_TOLERANCE } from './support'
import { FACES, type Body } from './types'

/** Så mycket (mm, åt alla håll) två delar ska gå in i varandra för att sitta ihop utan en yta emellan. */
const MIN_OVERLAP = 1

/**
 * Om a och b sitter ihop: en sida av den ena ligger an mot en sida av den andra (som när en del
 * vilar mot en annan, se support.ts), eller de går in i varandra (en hylla i ett spår).
 */
type Box = ReturnType<typeof bodiesBox>

function joined(a: Body, b: Body, A: Box, B: Box): boolean {
  // Lådorna runt dem, med marginalen: långt isär kan de inte nudda, och resten slipper räknas.
  const gap = [0, 1, 2].map((k) => Math.max(A.min[k]! - B.max[k]!, B.min[k]! - A.max[k]!))
  if (gap.some((g) => g > CONTACT_TOLERANCE)) return false
  if (gap.every((g) => g < -MIN_OVERLAP)) return true
  return FACES.some((f) => contact(a, f, b))
}

/**
 * Allt som sitter ihop med start, direkt eller via andra delar: en hel stol när man trippelklickar
 * på ett ben. Verktyg (tappar, urtag) binder ihop delarna de sitter på men blir inte själva valda;
 * de följer med sina delar ändå. Golvet är ingen del och binder inte ihop något.
 * Returnerar id:n med start sist, i den ordning de hittades.
 */
export function connectedParts(bodies: readonly Body[], start: string): string[] {
  const byId = new Map(bodies.map((b) => [b.id, b]))
  if (!byId.has(start)) return []
  const boxes = new Map(bodies.map((b) => [b.id, bodiesBox([b])]))
  // Ett verktyg hör ihop med delarna det sitter på, och de med varandra genom det.
  const links = new Map<string, Set<string>>()
  const link = (x: string, y: string) => {
    if (!byId.has(x) || !byId.has(y)) return
    ;(links.get(x) ?? links.set(x, new Set()).get(x)!).add(y)
    ;(links.get(y) ?? links.set(y, new Set()).get(y)!).add(x)
  }
  for (const b of bodies) if (b.tool) for (const host of toolTargets(b.tool)) link(b.id, host)

  const seen = new Set([start])
  const queue = [start]
  while (queue.length > 0) {
    const id = queue.shift()!
    const b = byId.get(id)!
    for (const other of bodies) {
      if (seen.has(other.id)) continue
      const linked = links.get(id)?.has(other.id)
      if (!linked && (b.tool || other.tool || !joined(b, other, boxes.get(id)!, boxes.get(other.id)!))) continue
      seen.add(other.id)
      queue.push(other.id)
    }
  }
  const parts = [...seen].filter((id) => !byId.get(id)!.tool && id !== start)
  return byId.get(start)!.tool ? parts : [...parts, start]
}
