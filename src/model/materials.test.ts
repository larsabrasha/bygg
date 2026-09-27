import { describe, expect, it } from 'vitest'
import { buildCutList } from './cutlist'
import { buildCutPlan, defaultStocks, materialList } from './cutPlan'
import { partGeometry } from './partSheet'
import { compareMaterials, MATERIAL_SPECS, materialSpec, materialTitle } from './materials'
import { stockThicknesses } from './stockSnap'
import { testBody } from './testFixtures'
import type { Body } from './types'

/** En del med sidorna längs u och v och tjockleken längs n; fibern längs u. */
const part = (id: string, material: string, u: number, v: number, t: number, extra: Partial<Body> = {}) =>
  testBody({ id, name: id, material, profile: { x0: 0, y0: 0, x1: u, y1: v }, z0: 0, z1: t, ...extra })

describe('materialkatalogen', () => {
  it('har unika id, och skivor har tjocklekar och mått', () => {
    expect(new Set(MATERIAL_SPECS.map((m) => m.id)).size).toBe(MATERIAL_SPECS.length)
    for (const m of MATERIAL_SPECS) {
      if (m.kind !== 'wood') expect(m.thicknesses?.length, m.id).toBeGreaterThan(0)
      if (m.kind === 'sheet') expect(m.sheets?.length, m.id).toBeGreaterThan(0)
    }
  })

  it('räknar ett okänt material som massivt trä med sitt id som namn', () => {
    expect(materialSpec('valnöt')).toMatchObject({ kind: 'wood', grain: true, name: 'valnöt' })
    expect(materialTitle('mdf')).toBe('MDF')
    expect(materialTitle('spånskiva')).toBe('Spånskiva')
  })

  it('ordnar massivt trä först, sedan skivor, sist glas', () => {
    expect(['glas', 'mdf', 'furu', 'akryl', 'ek'].sort(compareMaterials)).toEqual([
      'ek',
      'furu',
      'akryl',
      'mdf',
      'glas',
    ])
  })
})

describe('material utan fiber', () => {
  it('får L längs det längre måttet i kaplistan, oavsett fiberaxeln', () => {
    const [row] = buildCutList([part('Rygg', 'mdf', 300, 900, 6)]).rows
    expect(row).toMatchObject({ length: 900, width: 300, thickness: 6 })
    // Trä följer fibern som förut.
    expect(buildCutList([part('Rygg', 'plywood', 300, 900, 6)]).rows[0]).toMatchObject({ length: 300, width: 900 })
  })

  it('får samma L och B på delritningen som i kaplistan', () => {
    expect(partGeometry(part('Rygg', 'mdf', 300, 900, 6)).size).toEqual([900, 300, 6])
    expect(partGeometry(part('Rygg', 'plywood', 300, 900, 6)).size).toEqual([300, 900, 6])
  })

  it('får en hel skiva som delarna får vridas på', () => {
    expect(defaultStocks('mdf', [{ length: 500, width: 300 }])).toEqual([{ length: 2440, width: 1220, rotate: true }])
    expect(defaultStocks('spånskiva', [{ length: 500, width: 300 }])).toEqual([
      { length: 2500, width: 1200, rotate: true },
    ])
  })

  it('snäpper mot skivans tjocklekar', () => {
    expect(stockThicknesses('mdf', 600)).toEqual({ thicknesses: [6, 8, 10, 12, 16, 19, 22, 25], source: 'MDF' })
    expect(stockThicknesses('glas', 600).source).toBe('Glas')
  })
})

describe('glas', () => {
  const bodies = [
    part('Sida', 'mdf', 800, 400, 19),
    part('Front', 'glas', 800, 400, 6, { id: 'g1' }),
    part('Front', 'glas', 800, 400, 6, { id: 'g2' }),
  ]

  it('står i kaplistan men inte i kapschemat', () => {
    expect(buildCutList(bodies).rows.map((r) => r.material)).toEqual(['mdf', 'glas'])
    const plan = buildCutPlan(bodies)
    expect(plan.groups.map((g) => g.material)).toEqual(['mdf'])
    expect(plan.ordered).toHaveLength(1)
    expect(plan.ordered[0]).toMatchObject({ count: 2, length: 800, width: 400, thickness: 6 })
  })

  it('står sist i materialet som behövs, som rutor att beställa', () => {
    const lines = materialList(buildCutPlan(bodies))
    // Tusentalen skrivs med hårt mellanslag.
    expect(lines.map((l) => l.text.replace(/\u00a0/g, ' '))).toEqual([
      '1 skiva MDF 19 × 1 220 × 2 440',
      '2 rutor glas 6 × 400 × 800',
    ])
    expect(lines[1]!.note).toBe('till mått')
  })
})
