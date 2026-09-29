import { describe, expect, it } from 'vitest'
import { convexHull, insidePolygon, lassoPick, segmentHits } from './lasso'
import type { Vec2 } from './types'

const square: Vec2[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
]

describe('lasso', () => {
  it('vet vad som är innanför en slinga, också en hopkrokad', () => {
    expect(insidePolygon([50, 50], square)).toBe(true)
    expect(insidePolygon([150, 50], square)).toBe(false)
    // Ett U: hålet i mitten är utanför.
    const u: Vec2[] = [
      [0, 0],
      [30, 0],
      [30, 70],
      [70, 70],
      [70, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]
    expect(insidePolygon([50, 30], u)).toBe(false)
    expect(insidePolygon([50, 90], u)).toBe(true)
  })

  it('väljer delarna vars mitt är innanför, inte de bakom kameran', () => {
    const centers = new Map<string, Vec2 | null>([
      ['inne', [20, 20]],
      ['ute', [200, 20]],
      ['bakom', null],
    ])
    expect(lassoPick(centers, square)).toEqual(['inne'])
    // För kort för att vara en slinga.
    expect(lassoPick(centers, square.slice(0, 2))).toEqual([])
  })
})

describe('delar som linjen dras över', () => {
  it('höljet runt en lådas hörn', () => {
    const hull = convexHull([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 5],
      [10, 0],
    ])
    expect(hull).toHaveLength(4)
    expect(hull).toEqual(
      expect.arrayContaining([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]),
    )
  })

  it('en sträcka träffar om den går in i, över eller längs polygonen', () => {
    expect(segmentHits([-10, 50], [110, 50], square)).toBe(true) // rakt över
    expect(segmentHits([50, 50], [60, 60], square)).toBe(true) // helt innanför
    expect(segmentHits([-10, 50], [10, 50], square)).toBe(true) // in i
    expect(segmentHits([-10, -10], [-10, 110], square)).toBe(false) // bredvid
    expect(segmentHits([0, -10], [0, 110], square)).toBe(true) // längs kanten
    // Förbi hörnet, utan att nudda.
    expect(segmentHits([-10, 5], [5, -10], square)).toBe(false)
  })
})
