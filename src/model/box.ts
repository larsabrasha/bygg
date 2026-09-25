import type { Rect } from './types'

/** Allt som har en profil och ett djup: en form (PartDef) eller en kopia (Body). */
export type Box = { profile: Rect; z0: number; z1: number }

/** Utsträckning längs frame-axlarna u, v, n. */
export function bodyExtents(box: Box): [number, number, number] {
  const p = box.profile
  return [p.x1 - p.x0, p.y1 - p.y0, box.z1 - box.z0]
}
