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
  // Rutan runt slingan först: det mesta ligger utanför den, och då behöver slingan inte gås igenom.
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of path) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
  const picked: string[] = []
  for (const [id, c] of centers)
    if (c && c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1 && insidePolygon(c, path)) picked.push(id)
  return picked
}

/** Det konvexa höljet runt punkterna (Andrews algoritm), moturs sett med y nedåt. Tomt för färre än tre. */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: Vec2[]) => {
    const out: Vec2[] = []
    for (const q of list) {
      while (out.length >= 2 && cross(out.at(-2)!, out.at(-1)!, q) <= 0) out.pop()
      out.push(q)
    }
    out.pop()
    return out
  }
  return [...half(p), ...half([...p].reverse())]
}

/** Korsar sträckorna ab och cd varandra (också när de bara nuddar)? */
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const side = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  const [d1, d2, d3, d4] = [side(c, d, a), side(c, d, b), side(a, b, c), side(a, b, d)]
  if (d1 !== d2 && d3 !== d4) return true
  const on = (p: Vec2, q: Vec2, r: Vec2) =>
    Math.min(p[0], q[0]) <= r[0] &&
    r[0] <= Math.max(p[0], q[0]) &&
    Math.min(p[1], q[1]) <= r[1] &&
    r[1] <= Math.max(p[1], q[1])
  return (
    (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d))
  )
}

/** Går sträckan ab över polygonen: en ände innanför, eller korsar den en kant? */
export function segmentHits(a: Vec2, b: Vec2, polygon: readonly Vec2[]): boolean {
  if (polygon.length < 3) return false
  if (insidePolygon(a, polygon) || insidePolygon(b, polygon)) return true
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++)
    if (segmentsCross(a, b, polygon[j]!, polygon[i]!)) return true
  return false
}
