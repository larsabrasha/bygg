import { describe, expect, it } from 'vitest'
import { evaluate } from './expr'
import { faceFrame, GROUND_FRAME } from './frame'
import { applyPositions, minCorner, placeAlong, rowPos, withoutPos } from './placement'
import { testBody } from './testFixtures'
import type { Instance, PartDef } from './types'

const def: PartDef = {
  id: 'd1',
  name: 'Del 1',
  material: 'furu',
  grainAxis: 'u',
  thicknessAxis: 'n',
  profile: { x0: 0, y0: 0, x1: 800, y1: 120 },
  z0: 0,
  z1: 22,
}
const inst: Instance = { id: 'i1', defId: 'd1', frame: GROUND_FRAME }

describe('placement', () => {
  it('hittar hörnet närmast origo i världen', () => {
    // Golvets v = −Z: profilens y 0..120 blir z 0..−120.
    expect(minCorner(inst, def)).toEqual([0, 0, -120])
  })

  it('hittar hörnet även för en del på en annan dels sida', () => {
    // Sidans u = −Z, v = +Y, n = +X: profilens x 0..800 går längs −Z.
    const side = { ...inst, frame: faceFrame(testBody(), 'u+') }
    expect(minCorner(side, def)).toEqual([800, 0, -800])
  })

  it('placerar hörnet på ett värde längs en axel och rör inte de andra', () => {
    const moved = placeAlong(inst, def, 'y', 450)
    expect(minCorner(moved, def)).toEqual([0, 450, -120])
    expect(placeAlong(inst, def, 'x', 0)).toBe(inst)
  })

  it('räknar läget från uttryck och hoppar över det som inte går att beräkna', () => {
    const withPos = { ...inst, pos: { y: 'h - 22', x: 'okänd' } }
    const [out] = applyPositions([withPos], [def], new Map([['h', 722]]))
    expect(minCorner(out!, def)).toEqual([0, 700, -120])
  })

  it('tar bort uttrycken för axlar som flyttats för hand', () => {
    const withPos: Instance = { ...inst, pos: { x: 'a', y: 'b' } }
    expect(withoutPos(withPos, ['x']).pos).toEqual({ y: 'b' })
    expect(withoutPos(withPos, ['x', 'y'])).not.toHaveProperty('pos')
    expect(withoutPos(inst, ['x'])).toBe(inst)
  })
})

describe('rowPos', () => {
  const at = (x: number, pos?: Instance['pos']): Instance => ({
    id: 'i',
    defId: def.id,
    frame: { origin: [x, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
    ...(pos && { pos }),
  })

  it('bygger på originalets läge och sätter steget inom parentes när det behövs', () => {
    expect(rowPos(at(0), def, { axis: 'x', step: '(h - 18) / 4' }, 1)).toEqual({ x: '(h - 18) / 4' })
    expect(rowPos(at(0), def, { axis: 'x', step: 'h - 18' }, 2)).toEqual({ x: '2 * (h - 18)' })
    expect(rowPos(at(18), def, { axis: 'x', step: '(h - 18) / 4' }, 2)).toEqual({ x: '18 + 2 * (h - 18) / 4' })
    expect(rowPos(at(18), def, { axis: 'x', step: '(h - 18)' }, 3)).toEqual({ x: '18 + 3 * (h - 18)' })
    expect(rowPos(at(0), def, { axis: 'x', step: 'h' }, 1)).toEqual({ x: 'h' })
    expect(rowPos(at(0), def, { axis: 'x', step: '-(a + b)' }, 2)).toEqual({ x: '-2 * (a + b)' })
    // Minus gäller bara a: hela steget inom parentes.
    expect(rowPos(at(0), def, { axis: 'x', step: '-a + b' }, 2)).toEqual({ x: '2 * (-a + b)' })
    expect(rowPos(at(5), def, { axis: 'x', step: '-a + b' }, 1)).toEqual({ x: '5 + (-a + b)' })
  })

  it('uttrycket räknas till originalets läge plus k steg', () => {
    const scope = new Map([
      ['a', 7],
      ['b', 30],
      ['h', 900],
    ])
    const value = (e: string) => {
      const r = evaluate(e, (n) => scope.get(n))
      if (!r.ok) throw new Error(`${e}: ${r.error}`)
      return r.value
    }
    for (const step of ['h', '(h - 18) / 4', 'h - 18', '-h / 3', '-(a + b)', '-a + b', 'a * b - h', '2,5'])
      for (const [x, base] of [
        [0, 0],
        [18, 18],
      ] as const)
        for (const k of [1, 2, 5]) {
          const expr = rowPos(at(x), def, { axis: 'x', step }, k).x!
          expect(value(expr), expr).toBeCloseTo(base + k * value(step), 9)
        }
  })

  it('tar med originalets uttryck, längs radens axel och de andra', () => {
    expect(rowPos(at(5, { x: 'a', y: 'b' }), def, { axis: 'x', step: '-10' }, 2)).toEqual({ x: 'a - 2 * 10', y: 'b' })
  })
})
