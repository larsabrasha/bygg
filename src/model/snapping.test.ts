import { describe, expect, it } from 'vitest'
import { GROUND_FRAME } from './frame'
import { bodyKeyPoints, offsetTargets, planeTargets, snapDelta, snapValue } from './snapping'
import { testBody } from './testFixtures'

describe('snapValue', () => {
  it('snäpper till mål inom toleransen', () => {
    expect(snapValue(118, 10, [0, 120], 5)).toEqual({ value: 120, onTarget: true })
  })

  it('väljer närmaste mål', () => {
    expect(snapValue(3, 10, [0, 5], 5).value).toBe(5)
  })

  it('faller tillbaka på rutnätet', () => {
    expect(snapValue(64, 10, [0, 120], 5)).toEqual({ value: 60, onTarget: false })
  })
})

describe('bodyKeyPoints', () => {
  it('ger 8 hörn och 12 kantmittpunkter', () => {
    expect(bodyKeyPoints(testBody())).toHaveLength(20)
  })
})

describe('planeTargets', () => {
  it('projicerar andra kroppar på planet och hoppar över den uteslutna', () => {
    // testBody: x 0..800, lokalt y 0..120 i golvframen.
    const t = planeTargets([testBody(), testBody({ id: 'b2' })], GROUND_FRAME, 'b2')
    expect(new Set(t.xs)).toEqual(new Set([0, 400, 800]))
    expect(new Set(t.ys.map((y) => Math.round(y)))).toEqual(new Set([0, 60, 120]))
  })
})

describe('offsetTargets', () => {
  it('ger avstånd längs normalen till kroppens nivåer', () => {
    const t = offsetTargets([testBody({ z0: 100, z1: 122 })], [0, 0, 0], [0, 1, 0])
    expect(new Set(t)).toEqual(new Set([100, 111, 122]))
  })
})

describe('snapDelta', () => {
  it('lägger en flyttad punkt i linje med ett mål, per axel', () => {
    // Flyttad punkt i x=0; mål i x=800. Dra 795 → snäpper till 800.
    const r = snapDelta([795, 33], [[0, 0]], { xs: [800], ys: [] }, 10, 10)
    expect(r).toEqual({ delta: [800, 30], onTarget: [true, false] })
  })
})
