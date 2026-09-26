import { describe, expect, it } from 'vitest'
import { GROUND_FRAME } from './frame'
import {
  alignedGuides,
  bodyKeyPoints,
  guideLines,
  movedPoints,
  offsetTargets,
  planeTargets,
  rectMidpoints,
  snapDelta,
  snapValue,
} from './snapping'
import type { Vec2, Vec3 } from './types'
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

describe('guideLines', () => {
  // Golvet: planets (x, y) är världens (x, 0, −y).
  const pt = (x: number, y: number, h = 0) => ({ at: [x, y] as Vec2, world: [x, h, -y] as Vec3 })
  const targets = { xs: [0, 400], ys: [0, 60], points: [pt(0, 0), pt(400, 60, 50), pt(400, 300)] }

  it('drar en linje från den närmaste punkten i linje, per axel som snäppte, i världen', () => {
    // x = 400 snäppte: från (400, 60), som ligger närmare än (400, 300). Den sitter 50 mm upp.
    expect(guideLines(GROUND_FRAME, [400, 100], targets, [true, false])).toEqual([
      [
        [400, 50, -60],
        [400, 0, -100],
      ],
    ])
  })

  it('ingen linje när punkten sitter på målpunkten själv, eller utan punkter', () => {
    expect(guideLines(GROUND_FRAME, [0, 0], { ...targets, points: [pt(0, 0)] }, [true, true])).toEqual([])
    expect(guideLines(GROUND_FRAME, [400, 100], { xs: [400], ys: [] }, [true, false])).toEqual([])
  })
})

describe('alignedGuides', () => {
  it('drar linjen från målet till den flyttade punkt som snäppte', () => {
    // En del med hörn i x = 0 och x = 100 flyttas 300: hörnet i x = 100 hamnar i x = 400.
    const moving = movedPoints(
      [
        [0, 0],
        [100, 0],
      ],
      [
        [0, 0, 0],
        [100, 0, 0],
      ],
      [300, 200],
      [300, 0, -200],
    )
    const targets = { xs: [400], ys: [], points: [{ at: [400, 0] as Vec2, world: [400, 0, 0] as Vec3 }] }
    expect(alignedGuides(moving, targets, [true, false])).toEqual([
      [
        [400, 0, 0],
        [400, 0, -200],
      ],
    ])
  })
})

describe('rectMidpoints', () => {
  it('ger kantmitterna och mitten', () => {
    expect(rectMidpoints({ x0: 0, y0: 0, x1: 400, y1: 300 })).toEqual([
      [200, 0],
      [200, 300],
      [0, 150],
      [400, 150],
      [200, 150],
    ])
  })
})
