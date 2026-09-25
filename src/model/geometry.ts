import { type Box } from './box'
import { defaultAxes } from './partAxes'

export { bodyExtents, type Box } from './box'
import { toWorld } from './frame'
import type { Axis, Body, Face, Instance, PartDef, Rect, Sketch, Vec2, Vec3 } from './types'

/** Axeln som en sida sitter vinkelrätt mot. */
export const faceAxis = (face: Face): Axis => face[0] as Axis

/** Mitten av en del i världskoordinater; där flyttpilarna sitter och det den vrids runt. */
export function bodyCenter(b: Body): Vec3 {
  const { x0, x1, y0, y1 } = b.profile
  return toWorld(b.frame, [(x0 + x1) / 2, (y0 + y1) / 2, (b.z0 + b.z1) / 2])
}

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

type PartProps = Pick<PartDef, 'name' | 'material'> & { defId: string; instanceId: string }

/**
 * Drar ut en skiss till en ny del: en form och en kopia i skissens frame.
 * Negativt avstånd drar in mot −n.
 */
export function sketchToPart(
  sketch: Sketch,
  distance: number,
  props: PartProps,
  depthExpr?: string,
): { def: PartDef; instance: Instance } | null {
  if (Math.abs(distance) < MIN_SIZE || !isValidRect(sketch.rect)) return null
  const dims = { ...sketch.dims }
  if (depthExpr) dims.n = { expr: depthExpr, anchor: distance >= 0 ? 'min' : 'max' }
  const box = { profile: sketch.rect, z0: Math.min(0, distance), z1: Math.max(0, distance) }
  const def: PartDef = {
    id: props.defId,
    name: props.name,
    material: props.material,
    ...defaultAxes(box),
    ...box,
    ...(Object.keys(dims).length ? { dims } : {}),
  }
  return { def, instance: { id: props.instanceId, defId: def.id, frame: sketch.frame } }
}

/**
 * Flyttar en av kroppens sidor längs sidans normal. Positivt avstånd = utåt.
 * Null om något mått skulle bli mindre än MIN_SIZE.
 */
export function pushPullBody<T extends Box>(body: T, face: Face, distance: number): T | null {
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

/** Första lediga namnet "Del N". */
export function nextPartName(defs: readonly Pick<PartDef, 'name'>[]): string {
  const used = new Set(defs.map((b) => b.name))
  let n = 1
  while (used.has(`Del ${n}`)) n++
  return `Del ${n}`
}
