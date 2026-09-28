import type { Vec2 } from './types'

/** Om punkten ligger innanför polygonen (jämn–udda-regeln; självkorsande slingor räknas som de ritas). */
export function insidePolygon([x, y]: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Delarna man ringat in: de vars mitt, sedd på skärmen, ligger innanför slingan. Mitten och inte
 * hela delen, så att en lång bräda går att ringa in utan att hela den får plats, och så att det
 * är lätt att förutse vad som blir valt. Delar bakom kameran (null) räknas inte.
 */
export function lassoPick(centers: ReadonlyMap<string, Vec2 | null>, path: readonly Vec2[]): string[] {
  if (path.length < 3) return []
  return [...centers].filter(([, c]) => c !== null && insidePolygon(c, path)).map(([id]) => id)
}
