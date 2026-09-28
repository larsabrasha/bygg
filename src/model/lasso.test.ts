import { describe, expect, it } from 'vitest'
import { insidePolygon, lassoPick } from './lasso'
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
