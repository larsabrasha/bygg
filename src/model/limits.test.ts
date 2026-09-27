import { describe, expect, it } from 'vitest'
import { GROUND_FRAME } from './frame'
import { LIMITS, limitError, measure } from './limits'
import { emptyDoc } from './testFixtures'
import type { ModelDocument } from './types'

const def = { id: 'd1', name: 'Del', material: 'furu', grainAxis: 'u' as const, thicknessAxis: 'n' as const }
const box = { profile: { x0: 0, y0: 0, x1: 800, y1: 120 }, z0: 0, z1: 22 }

function withParts(n: number, at: [number, number, number] = [0, 0, 0]): ModelDocument {
  return {
    ...emptyDoc(),
    defs: [{ ...def, ...box }],
    instances: Array.from({ length: n }, (_, i) => ({
      id: `i${i}`,
      defId: 'd1',
      frame: { ...GROUND_FRAME, origin: at },
    })),
  }
}

describe('limitError', () => {
  it('godkänner en vanlig modell', () => {
    expect(limitError(withParts(20))).toBeNull()
  })

  it('stoppar för många delar', () => {
    expect(limitError(withParts(LIMITS.instances))).toBeNull()
    expect(limitError(withParts(LIMITS.instances + 1))).toMatch(/högst 2000 delar/)
  })

  it('en modell över gränsen går att krympa men inte öka', () => {
    const big = withParts(LIMITS.instances + 5)
    expect(limitError(withParts(LIMITS.instances + 4), big)).toBeNull()
    expect(limitError(withParts(LIMITS.instances + 6), big)).not.toBeNull()
  })

  it('mäter hörnen i världen, inte bara origo', () => {
    // Origo inom gränsen, men delen är 800 mm lång längs x.
    expect(measure(withParts(1, [LIMITS.extent - 100, 0, 0])).extent).toBe(LIMITS.extent + 700)
    expect(limitError(withParts(1, [LIMITS.extent - 100, 0, 0]))).toMatch(/100 m från origo/)
    expect(limitError(withParts(1, [-LIMITS.extent + 800, 0, 0]))).toBeNull()
  })

  it('stoppar långa uttryck och namn', () => {
    const long = { ...emptyDoc(), params: [{ id: 'p', name: 'a', expr: '1+'.repeat(300) + '1', value: 1 }] }
    expect(limitError(long)).toMatch(/uttryck/)
    const name = { ...withParts(1), defs: [{ ...def, ...box, name: 'x'.repeat(LIMITS.nameLength + 1) }] }
    expect(limitError(name)).toMatch(/namn/)
  })

  it('stoppar orimliga lagermått', () => {
    const doc = { ...emptyDoc(), stock: { sizes: { 'furu|22': [{ length: 1e9, width: 100 }] } } }
    expect(limitError(doc)).toMatch(/origo/)
  })
})
