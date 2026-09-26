import { describe, expect, it } from 'vitest'
import { endGrainFor, pliesFor } from './endGrain'

describe('endGrainFor', () => {
  it('lägger märgen utanför en bräda, längs tjockleken, och bågarna längs bredden', () => {
    // Bräda 600 lång (x, fibern), 150 bred (y), 22 tjock (z). Planet tvärs fibern är (y, z).
    const { pith, tangent } = endGrainFor([-300, -75, -11], [300, 75, 11], 0, false, 'a')
    expect(Math.abs(pith[1])).toBeGreaterThan(11 + 40)
    expect(Math.abs(pith[0])).toBeLessThanOrEqual(0.3 * 150)
    expect(tangent).toEqual([1, 0])
  })

  it('följer fibern när den går längs en annan axel', () => {
    // Fibern längs z; planet är (x, y), och brädan är tunn i x.
    const { pith, tangent } = endGrainFor([-10, -100, 0], [10, 100, 800], 2, false, 'b')
    expect(Math.abs(pith[0])).toBeGreaterThan(10 + 40)
    expect(tangent).toEqual([0, 1])
  })

  it('lägger märgen nära mitten på en rund del', () => {
    const { pith } = endGrainFor([-20, -20, 0], [20, 20, 400], 2, true, 'c')
    expect(Math.hypot(pith[0], pith[1])).toBeLessThanOrEqual(40 * 0.15 + 1e-9)
  })

  it('ger samma märg för samma del och olika för olika', () => {
    const box = [
      [-300, -75, -11],
      [300, 75, 11],
    ] as const
    expect(endGrainFor(box[0], box[1], 0, false, 'a')).toEqual(endGrainFor(box[0], box[1], 0, false, 'a'))
    expect(endGrainFor(box[0], box[1], 0, false, 'a')).not.toEqual(endGrainFor(box[0], box[1], 0, false, 'x'))
  })
})

describe('pliesFor', () => {
  it('delar tjockleken i ett udda antal skikt runt 1,5 mm', () => {
    // 12 mm plywood, tjockleken längs z: 8 skikt blir 9, så att ytfanéren går åt samma håll.
    const p = pliesFor([0, 0, -6], [600, 400, 6], 2)
    expect(p.axis).toBe(2)
    expect(p.min).toBe(-6)
    expect(12 / p.ply).toBeCloseTo(9)
  })

  it('ger minst tre skikt i tunn plywood', () => {
    expect(3 / pliesFor([0, 0, 0], [3, 100, 100], 0).ply).toBeCloseTo(3)
  })
})
