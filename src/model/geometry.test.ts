import { describe, expect, it } from 'vitest'
import { bodyDims, nextBodyName, pushPullBody, rectFromCorners, sketchToBody, snap } from './geometry'
import { testBody, testSketch } from './testFixtures'

const props = { id: 'b9', name: 'Del 9', material: 'ek', grain: 'length' as const }

describe('rectFromCorners', () => {
  it('normaliserar hörnen oavsett ordning', () => {
    expect(rectFromCorners([100, -20], [-50, 40])).toEqual({ x0: -50, y0: -20, x1: 100, y1: 40 })
  })
})

describe('sketchToBody', () => {
  it('drar ut uppåt vid positivt avstånd', () => {
    expect(sketchToBody(testSketch(), 22, props)).toMatchObject({ z0: 0, z1: 22, profile: testSketch().rect })
  })

  it('drar ut nedåt vid negativt avstånd', () => {
    expect(sketchToBody(testSketch(), -18, props)).toMatchObject({ z0: -18, z1: 0 })
  })

  it('avvisar för litet avstånd', () => {
    expect(sketchToBody(testSketch(), 0.5, props)).toBeNull()
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

describe('bodyDims', () => {
  it('sorterar till längd ≥ bredd ≥ tjocklek oavsett axel', () => {
    // Stående bräda: 22 längs u, 120 längs v, 800 längs n.
    const standing = testBody({ profile: { x0: 0, y0: 0, x1: 22, y1: 120 }, z0: 0, z1: 800 })
    expect(bodyDims(standing)).toEqual({ length: 800, width: 120, thickness: 22 })
  })
})

describe('snap', () => {
  it('snäpper till mål inom toleransen', () => {
    expect(snap(118, 10, [0, 120], 5)).toBe(120)
  })

  it('väljer närmaste mål', () => {
    expect(snap(3, 10, [0, 5], 5)).toBe(5)
  })

  it('faller tillbaka på rutnätet', () => {
    expect(snap(64, 10, [0, 120], 5)).toBe(60)
  })
})

describe('nextBodyName', () => {
  it('tar första lediga numret', () => {
    expect(nextBodyName([testBody({ name: 'Del 1' }), testBody({ name: 'Del 3' })])).toBe('Del 2')
  })
})
