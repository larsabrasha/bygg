import { describe, expect, it } from 'vitest'
import { nextPartName, pushPullBody, rectFromCorners, sketchToPart } from './geometry'
import { testBody, testSketch } from './testFixtures'

const props = { defId: 'd9', instanceId: 'i9', name: 'Del 9', material: 'ek' }

describe('rectFromCorners', () => {
  it('normaliserar hörnen oavsett ordning', () => {
    expect(rectFromCorners([100, -20], [-50, 40])).toEqual({ x0: -50, y0: -20, x1: 100, y1: 40 })
  })
})

describe('sketchToPart', () => {
  it('drar ut uppåt vid positivt avstånd, och kopian får skissens frame', () => {
    const r = sketchToPart(testSketch(), 22, props)
    expect(r?.def).toMatchObject({ id: 'd9', z0: 0, z1: 22, profile: testSketch().rect })
    // 800 × 120 × 22: fibern längs längsta (u), tjockleken längs kortaste (n).
    expect(r?.def).toMatchObject({ grainAxis: 'u', thicknessAxis: 'n' })
    expect(r?.instance).toEqual({ id: 'i9', defId: 'd9', frame: testSketch().frame })
  })

  it('drar ut nedåt vid negativt avstånd', () => {
    expect(sketchToPart(testSketch(), -18, props)?.def).toMatchObject({ z0: -18, z1: 0 })
  })

  it('avvisar för litet avstånd', () => {
    expect(sketchToPart(testSketch(), 0.5, props)).toBeNull()
  })

  it('tar med skissens uttryck och djupets uttryck, med anchor mot skissplanet', () => {
    const sketch = testSketch({ dims: { u: { expr: 'l', anchor: 'min' } } })
    expect(sketchToPart(sketch, 22, props, 't')?.def.dims).toEqual({
      u: { expr: 'l', anchor: 'min' },
      n: { expr: 't', anchor: 'min' },
    })
    expect(sketchToPart(sketch, -22, props, 't')?.def.dims?.n).toEqual({ expr: 't', anchor: 'max' })
  })
})

describe('pushPullBody', () => {
  const body = testBody()

  it.each([
    ['u+', { profile: { x0: 0, y0: 0, x1: 900, y1: 120 } }],
    ['u-', { profile: { x0: -100, y0: 0, x1: 800, y1: 120 } }],
    ['v+', { profile: { x0: 0, y0: 0, x1: 800, y1: 220 } }],
    ['v-', { profile: { x0: 0, y0: -100, x1: 800, y1: 120 } }],
    ['n+', { z0: 0, z1: 122 }],
    ['n-', { z0: -100, z1: 22 }],
  ] as const)('flyttar sidan %s utåt', (face, expected) => {
    expect(pushPullBody(body, face, 100)).toMatchObject(expected)
  })

  it('krymper vid negativt avstånd', () => {
    expect(pushPullBody(body, 'n+', -4)).toMatchObject({ z0: 0, z1: 18 })
  })

  it('avvisar när kroppen skulle bli tunnare än 1 mm', () => {
    expect(pushPullBody(body, 'n+', -22)).toBeNull()
    expect(pushPullBody(body, 'u-', -800)).toBeNull()
  })
})

describe('nextPartName', () => {
  it('tar första lediga numret', () => {
    expect(nextPartName([testBody({ name: 'Del 1' }), testBody({ name: 'Del 3' })])).toBe('Del 2')
  })
})
