import { describe, expect, it } from 'vitest'
import { buildCutList, groupByMaterial } from './cutlist'
import { testBody } from './testFixtures'

describe('buildCutList', () => {
  it('ger tom lista utan kroppar', () => {
    expect(buildCutList([])).toEqual({ rows: [], totalCount: 0, totalVolumeM3: 0 })
  })

  it('mäter i delens egen riktning, så liggande och stående del blir samma rad', () => {
    const lying = testBody({ id: 'a', name: 'Ben' })
    const standing = testBody({
      id: 'b',
      name: 'Ben',
      profile: { x0: 0, y0: 0, x1: 22, y1: 120 },
      z0: 0,
      z1: 800,
      grainAxis: 'n',
      thicknessAxis: 'u',
    })
    const list = buildCutList([lying, standing])
    expect(list.rows).toHaveLength(1)
    expect(list.rows[0]).toMatchObject({ count: 2, length: 800, width: 120, thickness: 22, bodyIds: ['a', 'b'] })
  })

  it('L följer fibern, inte storleken', () => {
    const crossGrain = testBody({
      profile: { x0: 0, y0: 0, x1: 300, y1: 900 },
      z1: 18,
      grainAxis: 'u',
      thicknessAxis: 'n',
    })
    expect(buildCutList([crossGrain]).rows[0]).toMatchObject({ length: 300, width: 900, thickness: 18 })
  })

  it('slår inte isär delar på grund av flyttalsbrus', () => {
    const a = testBody({ id: 'a', z1: 22 })
    const b = testBody({ id: 'b', z0: 0.1 + 0.2 - 0.3, z1: 22.00000001 })
    expect(buildCutList([a, b]).rows).toHaveLength(1)
  })

  it('håller isär olika material och mått', () => {
    const list = buildCutList([
      testBody({ id: 'a' }),
      testBody({ id: 'b', material: 'ek' }),
      testBody({ id: 'c', z1: 18 }),
    ])
    expect(list.rows).toHaveLength(3)
  })

  it('sorterar på material, sedan tjocklek och längd fallande', () => {
    const list = buildCutList([
      testBody({ id: 'a', z1: 18 }),
      testBody({ id: 'b', profile: { x0: 0, y0: 0, x1: 300, y1: 120 } }),
      testBody({ id: 'c' }),
      testBody({ id: 'd', material: 'ek' }),
    ])
    expect(list.rows.map((r) => r.bodyIds[0])).toEqual(['d', 'c', 'b', 'a'])
  })

  it('räknar total volym i m³', () => {
    // 1000 × 100 × 20 mm = 0,002 m³
    const b = testBody({ profile: { x0: 0, y0: 0, x1: 1000, y1: 100 }, z0: 0, z1: 20 })
    expect(buildCutList([b, { ...b, id: 'b2' }]).totalVolumeM3).toBeCloseTo(0.004)
  })

  it('räknar volym per rad', () => {
    const b = testBody({ profile: { x0: 0, y0: 0, x1: 1000, y1: 100 }, z0: 0, z1: 20 })
    expect(buildCutList([b, { ...b, id: 'b2' }]).rows[0]!.volumeM3).toBeCloseTo(0.004)
  })
})

describe('groupByMaterial', () => {
  it('samlar raderna per material med antal och volym', () => {
    const list = buildCutList([
      testBody({ id: 'a' }),
      testBody({ id: 'b' }),
      testBody({ id: 'c', z1: 18 }),
      testBody({ id: 'd', material: 'ek' }),
    ])
    const groups = groupByMaterial(list.rows)
    expect(groups.map((g) => [g.material, g.rows.length, g.count])).toEqual([
      ['ek', 1, 1],
      ['furu', 2, 3],
    ])
    expect(groups.reduce((sum, g) => sum + g.volumeM3, 0)).toBeCloseTo(list.totalVolumeM3)
  })
})
