import type { Axis, Rect, Shape } from './types'

/** Allt som har en profil och ett djup: en form (PartDef) eller en kopia (Body). */
export type Box = { profile: Rect; shape?: Shape; z0: number; z1: number }

/** Utsträckning längs frame-axlarna u, v, n. */
export function bodyExtents(box: Box): [number, number, number] {
  const p = box.profile
  return [p.x1 - p.x0, p.y1 - p.y0, box.z1 - box.z0]
}

/** Axlarna som ändras när axis ändras: för en cirkel både u och v (diametern), annars bara axis. */
export function linkedAxes(box: Pick<Box, 'shape'>, axis: Axis): Axis[] {
  return box.shape === 'circle' && axis !== 'n' ? ['u', 'v'] : [axis]
}

/**
 * Håller en cirkel rund efter att dess mått längs changed (u eller v) ändrats:
 * den andra axeln får samma längd, kring sin egen mitt. Så ligger cirkeln
 * kvar mot sidan som inte flyttades, och mitt på längs den andra axeln.
 */
export function keepRound<T extends Box>(box: T, changed: Axis): T {
  if (box.shape !== 'circle' || changed === 'n') return box
  const p = box.profile
  const size = changed === 'u' ? p.x1 - p.x0 : p.y1 - p.y0
  if (changed === 'u') {
    const mid = (p.y0 + p.y1) / 2
    return { ...box, profile: { ...p, y0: mid - size / 2, y1: mid + size / 2 } }
  }
  const mid = (p.x0 + p.x1) / 2
  return { ...box, profile: { ...p, x0: mid - size / 2, x1: mid + size / 2 } }
}
