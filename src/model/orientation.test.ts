import { describe, expect, it } from 'vitest'
import { GROUND_FRAME, rotateFrame } from './frame'
import { anglesOf, restOf, snapAxes, withAngles } from './orientation'

describe('vinklar', () => {
  it('en orörd del på golvet har vinklarna 0', () => {
    expect(anglesOf(GROUND_FRAME, restOf({ frame: GROUND_FRAME }))).toEqual([0, 0, 0])
  })

  it('läser tillbaka en vridning runt en axel i taget', () => {
    for (const [axis, i] of [
      [[1, 0, 0], 0],
      [[0, 1, 0], 1],
      [[0, 0, 1], 2],
    ] as const) {
      const f = rotateFrame(GROUND_FRAME, [0, 0, 0], [...axis], 30)
      const expected = [0, 0, 0]
      expected[i] = 30
      expect(anglesOf(f, GROUND_FRAME)).toEqual(expected)
    }
  })

  it('withAngles och anglesOf går fram och tillbaka', () => {
    const f = withAngles(GROUND_FRAME, GROUND_FRAME, [0, 0, 0], [10, 20, 30])
    const [x, y, z] = anglesOf(f, GROUND_FRAME)
    expect(x).toBeCloseTo(10)
    expect(y).toBeCloseTo(20)
    expect(z).toBeCloseTo(30)
  })

  it('vrider runt center, som står still', () => {
    const center: [number, number, number] = [300, 11, -200]
    const f = withAngles(GROUND_FRAME, GROUND_FRAME, center, [0, 90, 0])
    expect(f).toEqual(rotateFrame(GROUND_FRAME, center, [0, 1, 0], 90))
  })

  it('snapAxes ger närmaste läge längs världens axlar, högerhänt', () => {
    const tilted = rotateFrame(GROUND_FRAME, [0, 0, 0], [0, 1, 0], 20)
    expect(snapAxes(tilted)).toEqual({ u: GROUND_FRAME.u, v: GROUND_FRAME.v, n: GROUND_FRAME.n })
  })
})
