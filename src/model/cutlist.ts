import { partDims } from './partAxes'
import type { Body } from './types'

export interface CutListRow {
  key: string
  count: number
  names: string[]
  length: number
  width: number
  thickness: number
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
const round = (n: number) => Math.round(n * 10) / 10

/**
 * Kaplista: L×B×T mäts i varje dels egen riktning (L längs fibern, T tjockleken),
 * så en roterad eller stående del får samma mått som en liggande.
 * Identiska delar (material + mått) blir en rad med antal.
 */
export function buildCutList(bodies: readonly Body[]): CutList {
  const groups = new Map<string, CutListRow>()
  let totalVolumeM3 = 0

  for (const b of bodies) {
    const d = partDims(b)
    const length = round(d.length)
    const width = round(d.width)
    const thickness = round(d.thickness)
    totalVolumeM3 += (d.length * d.width * d.thickness) / 1e9

    const key = `${b.material}|${length}|${width}|${thickness}`
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

  return { rows, totalCount: bodies.length, totalVolumeM3 }
}
