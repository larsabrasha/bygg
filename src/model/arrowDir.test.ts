import { describe, expect, it } from 'vitest'
import { HEAD_ON_ANGLE, MIN_VIEW_ANGLE, arrowDir, isHeadOn } from './arrowDir'
import type { Vec3 } from './types'
import { dot, length } from './vec'

const UP: Vec3 = [0, 1, 0]
const angleTo = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, Math.abs(dot(a, b))))

describe('arrowDir', () => {
  it('är normalen när pilen syns från sidan', () => {
    expect(arrowDir([1, 0, 0], [0, 0, 1], UP)).toEqual([1, 0, 0])
    const leaning: Vec3 = [Math.sin(1), 0, Math.cos(1)]
    expect(arrowDir(leaning, [0, 0, 1], UP)).toEqual(leaning)
  })

  it('lutar mot skärmens upp när ytan vetter rakt mot kameran', () => {
    const d = arrowDir([0, 0, 1], [0, 0, 1], UP)
    expect(length(d)).toBeCloseTo(1)
    expect(angleTo(d, [0, 0, 1])).toBeCloseTo(MIN_VIEW_ANGLE)
    expect(d[1]).toBeGreaterThan(0)
    expect(d[2]).toBeGreaterThan(0)
    expect(d[0]).toBeCloseTo(0)
  })

  it('pekar bort från kameran när ytan vetter bort', () => {
    const d = arrowDir([0, 0, -1], [0, 0, 1], UP)
    expect(d[2]).toBeLessThan(0)
    expect(d[1]).toBeGreaterThan(0)
    expect(angleTo(d, [0, 0, 1])).toBeCloseTo(MIN_VIEW_ANGLE)
  })

  it('går mjukt över till normalen vid gränsvinkeln', () => {
    const a = MIN_VIEW_ANGLE - 1e-4
    const n: Vec3 = [Math.sin(a), 0, Math.cos(a)]
    const d = arrowDir(n, [0, 0, 1], UP)
    for (let i = 0; i < 3; i++) expect(d[i]).toBeCloseTo(n[i]!, 3)
  })

  it('har alltid minst gränsvinkeln mot siktlinjen', () => {
    for (const a of [0, 0.05, 0.3, 0.7]) {
      const n: Vec3 = [Math.sin(a), 0, Math.cos(a)]
      expect(angleTo(arrowDir(n, [0, 0, 1], UP), [0, 0, 1])).toBeGreaterThanOrEqual(MIN_VIEW_ANGLE - 1e-9)
    }
  })

  it('får en stabil riktning när man tittar rakt uppifrån på en ovansida', () => {
    const d = arrowDir([0, 1, 0], [0, 1, 0], [0, 1, 0])
    expect(length(d)).toBeCloseTo(1)
    expect(angleTo(d, [0, 1, 0])).toBeCloseTo(MIN_VIEW_ANGLE)
  })
})

describe('isHeadOn', () => {
  it('sant när pilen pekar nästan rakt mot kameran eller bort, annars falskt', () => {
    const toCamera: [number, number, number] = [0, 0, 1]
    expect(isHeadOn([0, 0, 1], toCamera)).toBe(true)
    expect(isHeadOn([0, 0, -1], toCamera)).toBe(true)
    expect(isHeadOn([1, 0, 0], toCamera)).toBe(false)
    const a = HEAD_ON_ANGLE + 0.01
    expect(isHeadOn([Math.sin(a), 0, Math.cos(a)], toCamera)).toBe(false)
    const b = HEAD_ON_ANGLE - 0.01
    expect(isHeadOn([Math.sin(b), 0, Math.cos(b)], toCamera)).toBe(true)
  })
})
