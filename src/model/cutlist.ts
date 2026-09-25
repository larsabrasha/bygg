import { bodyExtents } from './box'
import { partDims } from './partAxes'
import type { Body } from './types'

export interface CutListRow {
  key: string
  count: number
  names: string[]
  length: number
  width: number
  thickness: number
  /**
   * Rund del (cylinder): diametern och längden längs cylindern. L×B×T är
   * ändå ämnet man kapar till, där två av måtten är diametern.
   */
  round?: { diameter: number; length: number }
  material: string
  bodyIds: string[]
}

export interface CutList {
  rows: CutListRow[]
  totalCount: number
  /** Total volym i kubikmeter. */
  totalVolumeM3: number
}

/** Mått avrundas till 0,1 mm så att flyttalsbrus inte delar upp lika delar. */
const round01 = (n: number) => Math.round(n * 10) / 10

/**
 * Kaplista: L×B×T mäts i varje dels egen riktning (L längs fibern, T tjockleken),
 * så en roterad eller stående del får samma mått som en liggande.
 * Identiska delar (material + mått) blir en rad med antal.
 */
export function buildCutList(bodies: readonly Body[]): CutList {
  const groups = new Map<string, CutListRow>()
  let totalVolumeM3 = 0

  for (const b of bodies) {
    // Ett verktyg är ingen egen bit: det skärs ut ur eller sitter på en annan del.
    if (b.tool) continue
    // Med något tillagt (en tapp) kapas ämnet större än formens låda.
    const d = partDims({ ...(b.blank ?? b), grainAxis: b.grainAxis, thicknessAxis: b.thicknessAxis })
    const length = round01(d.length)
    const width = round01(d.width)
    const thickness = round01(d.thickness)
    const [du, , dn] = bodyExtents(b)
    const round = b.shape === 'circle' && !b.blank ? { diameter: round01(du), length: round01(dn) } : undefined
    // En cylinder fyller π/4 av sin fyrkant.
    totalVolumeM3 += ((round ? Math.PI / 4 : 1) * d.length * d.width * d.thickness) / 1e9

    const key = `${b.material}|${length}|${width}|${thickness}|${round ? 'rund' : ''}`
    const row = groups.get(key)
    if (row) {
      row.count++
      if (!row.names.includes(b.name)) row.names.push(b.name)
      row.bodyIds.push(b.id)
    } else {
      groups.set(key, {
        key,
        count: 1,
        names: [b.name],
        length,
        width,
        thickness,
        ...(round && { round }),
        material: b.material,
        bodyIds: [b.id],
      })
    }
  }

  const rows = [...groups.values()].sort(
    (a, b) =>
      a.material.localeCompare(b.material, 'sv') ||
      b.thickness - a.thickness ||
      b.length - a.length ||
      b.width - a.width,
  )

  return { rows, totalCount: bodies.filter((b) => !b.tool).length, totalVolumeM3 }
}
