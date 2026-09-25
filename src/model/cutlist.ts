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
  /** Volymen för alla delar på raden, i kubikmeter. */
  volumeM3: number
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
    const volumeM3 = ((round ? Math.PI / 4 : 1) * d.length * d.width * d.thickness) / 1e9
    totalVolumeM3 += volumeM3

    const key = `${b.material}|${length}|${width}|${thickness}|${round ? 'rund' : ''}`
    const row = groups.get(key)
    if (row) {
      row.count++
      if (!row.names.includes(b.name)) row.names.push(b.name)
      row.bodyIds.push(b.id)
      row.volumeM3 += volumeM3
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
        volumeM3,
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

export interface MaterialGroup {
  material: string
  rows: CutListRow[]
  count: number
  volumeM3: number
}

/** Raderna per material, i kaplistans ordning (raderna är redan sorterade på material). */
export function groupByMaterial(rows: readonly CutListRow[]): MaterialGroup[] {
  const groups: MaterialGroup[] = []
  for (const row of rows) {
    let group = groups.at(-1)
    if (group?.material !== row.material) {
      group = { material: row.material, rows: [], count: 0, volumeM3: 0 }
      groups.push(group)
    }
    group.rows.push(row)
    group.count += row.count
    group.volumeM3 += row.volumeM3
  }
  return groups
}
