/**
 * Där en cylinders mantel vänder bort från kameran, sett längs axeln: de två
 * punkterna på cirkeln (mitt c, radie r) där linjen från kameran p tangerar den.
 * Konturlinjerna i trådmodellen går genom dem, längs axeln. Null om kameran
 * står innanför cirkeln (då finns ingen kontur).
 */
export function tangentPoints(
  [cx, cy]: [number, number],
  r: number,
  [px, py]: [number, number],
): [[number, number], [number, number]] | null {
  const dx = px - cx
  const dy = py - cy
  const d = Math.hypot(dx, dy)
  if (d <= r) return null
  const toCamera = Math.atan2(dy, dx)
  const spread = Math.acos(r / d)
  const at = (a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  return [at(toCamera + spread), at(toCamera - spread)]
}
