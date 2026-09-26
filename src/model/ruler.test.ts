import { describe, expect, it } from 'vitest'
import { rulerPointOn, rulerResult, snapCandidates, type RulerPoint } from './ruler'
import { testBody } from './testFixtures'

// Del 800 × 120 × 22 på golvet: x 0–800, z −120–0, y 0–22.
const body = testBody()
const up: [number, number, number] = [0, 1, 0]

describe('rulerPointOn', () => {
  it('har 8 hörn och 12 kantmitter att snäppa till', () => {
    const c = snapCandidates(body)
    expect(c.filter((x) => x.snap === 'corner')).toHaveLength(8)
    expect(c.filter((x) => x.snap === 'edge')).toHaveLength(12)
  })

  it('snäpper till hörnet nära trycket', () => {
    expect(rulerPointOn([body], [795, 22, -3], up, 10)).toEqual({ point: [800, 22, 0], normal: null, snap: 'corner' })
  })

  it('snäpper till kantmitten', () => {
    expect(rulerPointOn([body], [402, 22, -4], up, 10)).toMatchObject({ point: [400, 22, 0], snap: 'edge' })
  })

  it('snäpper till ett hörn på en annan del nära trycket', () => {
    const other = testBody({ id: 'b2', frame: { ...body.frame, origin: [800, 0, 0] } })
    // Trycket landade på första delen, 6 mm från hörnet på den andra.
    expect(rulerPointOn([body, other], [796, 22, -4], up, 10).point).toEqual([800, 22, 0])
    const far = testBody({ id: 'b3', frame: { ...body.frame, origin: [0, 0, -500] } })
    expect(rulerPointOn([body, far], [200, 22, -60], up, 10).snap).toBeNull()
  })

  it('tar träffpunkten på ytan när inget ligger nära', () => {
    expect(rulerPointOn([body], [200, 22, -60], up, 10)).toEqual({ point: [200, 22, -60], normal: up, snap: null })
  })
})

describe('rulerResult', () => {
  const p = (point: [number, number, number], normal: [number, number, number] | null = null): RulerPoint => ({
    point,
    normal,
    snap: normal ? null : 'corner',
  })

  it('mäter rakt mellan två punkter och delar upp på axlarna', () => {
    const r = rulerResult(p([0, 0, 0]), p([300, 0, -400]))
    expect(r).toMatchObject({ distance: 500, delta: [300, 0, -400], kind: 'points' })
  })

  it('mäter vinkelrätt mellan två parallella ytor, var man än tryckt på dem', () => {
    // Insidan av två sidor, 18 mm tjocka, 600 mm mellan ytterkanterna.
    const r = rulerResult(p([18, 300, -100], [1, 0, 0]), p([582, 450, -250], [-1, 0, 0]))
    expect(r).toMatchObject({ distance: 564, kind: 'planes', from: [18, 450, -250], to: [582, 450, -250] })
    expect(r.delta).toEqual([564, 0, 0])
  })

  it('mäter mellan punkterna när ytorna inte är parallella', () => {
    expect(rulerResult(p([0, 0, 0], [1, 0, 0]), p([0, 30, 40], [0, 1, 0])).kind).toBe('points')
  })
})
