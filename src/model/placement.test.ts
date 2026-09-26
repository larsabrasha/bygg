import { describe, expect, it } from 'vitest'
import { faceFrame, GROUND_FRAME } from './frame'
import { applyPositions, minCorner, placeAlong, withoutPos } from './placement'
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
