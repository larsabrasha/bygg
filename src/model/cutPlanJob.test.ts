import { afterEach, describe, expect, it } from 'vitest'
import { buildCutPlan } from './cutPlan'
import { cutPlanJob, runCutPlanJob } from './cutPlanJob'
import { setCustomMaterials, type MaterialSpec } from './materials'
import { testBody } from './testFixtures'
import type { Body } from './types'

const part = (id: string, length: number, extra: Partial<Body> = {}) =>
  testBody({ id, name: id, profile: { x0: 0, y0: 0, x1: length, y1: 95 }, z0: 0, z1: 22, ...extra })
const parts = () => [part('a', 700), part('b', 500)]

const board: MaterialSpec = {
  id: 'egen',
  name: 'egen skiva',
  kind: 'sheet',
  grain: false,
  color: '#aaaaaa',
  sheets: [{ length: 1000, width: 500 }],
}

afterEach(() => setCustomMaterials([]))

describe('cutPlanJob', () => {
  it('samma nyckel när en del bara flyttats', () => {
    const moved = parts().map((b) => ({ ...b, frame: { ...b.frame, origin: [100, 0, 50] as Body['frame']['origin'] } }))
    expect(cutPlanJob(moved).key).toBe(cutPlanJob(parts()).key)
  })

  it('ny nyckel när ett mått, ett namn eller inställningarna ändras', () => {
    const key = cutPlanJob(parts()).key
    expect(cutPlanJob([part('a', 900), part('b', 500)]).key).not.toBe(key)
    expect(cutPlanJob([part('a', 700, { name: 'Sarg' }), part('b', 500)]).key).not.toBe(key)
    expect(cutPlanJob(parts(), { kerf: 5 }).key).not.toBe(key)
  })

  it('ny nyckel när ett eget material ändras, och materialet följer med jobbet', () => {
    setCustomMaterials([board])
    const job = cutPlanJob([part('a', 700, { material: 'egen' })])
    expect(job.materials).toEqual([board])
    setCustomMaterials([{ ...board, sheets: [{ length: 2000, width: 500 }] }])
    expect(cutPlanJob([part('a', 700, { material: 'egen' })]).key).not.toBe(job.key)
  })

  it('verktyg följer inte med till workern', () => {
    const job = cutPlanJob([...parts(), part('t', 30, { tool: { op: 'subtract', host: 'a' } })])
    expect(job.bodies.map((b) => b.id)).toEqual(['a', 'b'])
  })

  it('ger samma schema som buildCutPlan, med de egna materialen från jobbet', () => {
    setCustomMaterials([board])
    const bodies = [part('a', 700, { material: 'egen' }), part('b', 500)]
    const expected = buildCutPlan(bodies)
    const job = cutPlanJob(bodies)
    // Som i workern: där finns inga egna material innan jobbet sätter dem.
    setCustomMaterials([])
    expect(runCutPlanJob(job)).toEqual(expected)
    expect(expected.groups.find((g) => g.material === 'egen')!.stocks[0]!.stock.length).toBe(1000)
  })
})
