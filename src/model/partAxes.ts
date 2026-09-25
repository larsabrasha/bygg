import type { Box } from './box'
import type { Axis, PartDef } from './types'

/**
 * Längd, bredd och tjocklek enligt snickarkonventionen: L längs fibern,
 * T är brädans tjocklek, B är det som blir över. Etiketterna följer axlarna,
 * inte storleksordningen, så de byter inte namn när ett mått ändras.
 */

export const AXES: readonly Axis[] = ['u', 'v', 'n']

const index = (a: Axis) => AXES.indexOf(a)

/** Utsträckning längs en axel. */
export function extent(box: Box, axis: Axis): number {
  const p = box.profile
  return axis === 'u' ? p.x1 - p.x0 : axis === 'v' ? p.y1 - p.y0 : box.z1 - box.z0
}

export type PartAxes = Pick<PartDef, 'grainAxis' | 'thicknessAxis'>

export function widthAxis({ grainAxis, thicknessAxis }: PartAxes): Axis {
  return AXES.find((a) => a !== grainAxis && a !== thicknessAxis)!
}

/**
 * Förslag när en del skapas: fibern längs det längsta måttet, tjockleken
 * längs det kortaste. Vid lika mått föredras n som tjocklek (det man drog ut)
 * och u som fiber.
 */
export function defaultAxes(box: Box): PartAxes {
  const e = (a: Axis) => extent(box, a)
  const byThin = [...AXES].sort((a, b) => e(a) - e(b) || (a === 'n' ? -1 : b === 'n' ? 1 : 0))
  const thicknessAxis = byThin[0]!
  const rest = AXES.filter((a) => a !== thicknessAxis)
  const grainAxis = [...rest].sort((a, b) => e(b) - e(a) || index(a) - index(b))[0]!
  return { grainAxis, thicknessAxis }
}

/**
 * Byter fiber- eller tjockleksaxel och håller dem olika. Väljs fibern längs
 * tjockleksaxeln (eller tvärtom) byter de två plats.
 */
export function withAxes(current: PartAxes, patch: Partial<PartAxes>): PartAxes {
  const grainAxis = patch.grainAxis ?? current.grainAxis
  const thicknessAxis = patch.thicknessAxis ?? current.thicknessAxis
  if (grainAxis !== thicknessAxis) return { grainAxis, thicknessAxis }
  // Krock: den axel som inte ändrades tar den andras gamla plats.
  return patch.grainAxis !== undefined
    ? { grainAxis, thicknessAxis: current.grainAxis }
    : { grainAxis: current.thicknessAxis, thicknessAxis }
}

export interface PartDims {
  length: number
  width: number
  thickness: number
}

export function partDims(part: Box & PartAxes): PartDims {
  return {
    length: extent(part, part.grainAxis),
    width: extent(part, widthAxis(part)),
    thickness: extent(part, part.thicknessAxis),
  }
}

/**
 * Äldre format (version 1) sparade fibern som 'length' (längs längsta måttet)
 * eller 'width' (längs näst längsta), och tjockleken var alltid det kortaste.
 */
export function axesFromLegacyGrain(box: Box, grain: unknown): PartAxes {
  const bySize = [...AXES].sort((a, b) => extent(box, b) - extent(box, a))
  return { grainAxis: grain === 'width' ? bySize[1]! : bySize[0]!, thicknessAxis: bySize[2]! }
}
