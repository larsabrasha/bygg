import { describe, expect, it } from 'vitest'
import { explodeOffsets } from './explode'
import { testBody } from './testFixtures'

// På golvet: profilens x är världens x, profilens y är världens −z, höjden är y.
const at = (id: string, x: number, z: number, y0 = 0, y1 = 20) =>
  testBody({ id, profile: { x0: x - 10, y0: -z - 10, x1: x + 10, y1: -z + 10 }, z0: y0, z1: y1 })

describe('explodeOffsets', () => {
  it('flyttar delarna bort från modellens mitt, amount gånger avståndet', () => {
    const offsets = explodeOffsets([at('a', -100, 0), at('b', 100, 0), at('c', 0, 0, 200, 220)], 0.5)
    // Mitten: x 0, höjd (10 + 210) / 2 = 110.
    expect(offsets.get('a')).toEqual([-50, -50, 0])
    expect(offsets.get('b')).toEqual([50, -50, 0])
    expect(offsets.get('c')).toEqual([0, 50, 0])
  })

  it('står kvar med amount 0, och en tapp följer delen den sitter på', () => {
    const tenon = testBody({ id: 't', tool: { op: 'joint', host: 'b', into: 'a' } })
    expect(Math.hypot(...explodeOffsets([at('a', -100, 0), at('b', 100, 0)], 0).get('a')!)).toBe(0)
    const offsets = explodeOffsets([at('a', -100, 0), at('b', 100, 0), tenon], 1)
    expect(offsets.get('t')).toEqual(offsets.get('b'))
  })
})
