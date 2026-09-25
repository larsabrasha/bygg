import type { Body, Face, Rect, Sketch, Vec2 } from './types'

/** Minsta mått en skiss eller kropp får ha, i mm. */
export const MIN_SIZE = 1

export function rectFromCorners(a: Vec2, b: Vec2): Rect {
  return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) }
}

export function rectSize(r: Rect): Vec2 {
  return [r.x1 - r.x0, r.y1 - r.y0]
}

export function isValidRect(r: Rect): boolean {
  const [w, h] = rectSize(r)
  return w >= MIN_SIZE && h >= MIN_SIZE
}

type BodyProps = Pick<Body, 'id' | 'name' | 'material' | 'grain'>

/** Drar ut en skiss till en kropp. Negativt avstånd drar in mot −n. */
export function sketchToBody(sketch: Sketch, distance: number, props: BodyProps): Body | null {
  if (Math.abs(distance) < MIN_SIZE || !isValidRect(sketch.rect)) return null
  return {
    ...props,
    frame: sketch.frame,
    profile: sketch.rect,
    z0: Math.min(0, distance),
    z1: Math.max(0, distance),
  }
}

/**
 * Flyttar en av kroppens sidor längs sidans normal. Positivt avstånd = utåt.
 * Null om något mått skulle bli mindre än MIN_SIZE.
 */
export function pushPullBody(body: Body, face: Face, distance: number): Body | null {
  const p = { ...body.profile }
  let { z0, z1 } = body
  switch (face) {
    case 'u+':
      p.x1 += distance
      break
    case 'u-':
      p.x0 -= distance
      break
    case 'v+':
      p.y1 += distance
      break
    case 'v-':
      p.y0 -= distance
      break
    case 'n+':
      z1 += distance
      break
    case 'n-':
      z0 -= distance
      break
  }
  if (!isValidRect(p) || z1 - z0 < MIN_SIZE) return null
  return { ...body, profile: p, z0, z1 }
}

/** Kroppens utsträckning längs frame-axlarna u, v, n. */
export function bodyExtents(body: Body): [number, number, number] {
  const [w, h] = rectSize(body.profile)
  return [w, h, body.z1 - body.z0]
}

/** Längd ≥ bredd ≥ tjocklek, mätt i kroppens egen riktning. */
export function bodyDims(body: Body): { length: number; width: number; thickness: number } {
  const [length, width, thickness] = bodyExtents(body).sort((a, b) => b - a) as [number, number, number]
  return { length, width, thickness }
}

/**
 * Snäpper ett värde: först till närmaste mål inom tol, annars till rutnätet step.
 * Mål är t.ex. kanterna på den yta man ritar på.
 */
export function snap(value: number, step: number, targets: readonly number[], tol: number): number {
  let best: number | null = null
  for (const t of targets) {
    if (Math.abs(t - value) <= tol && (best === null || Math.abs(t - value) < Math.abs(best - value))) best = t
  }
  return best ?? Math.round(value / step) * step
}

/** Första lediga namnet "Del N". */
export function nextBodyName(bodies: readonly Body[]): string {
  const used = new Set(bodies.map((b) => b.name))
  let n = 1
  while (used.has(`Del ${n}`)) n++
  return `Del ${n}`
}
