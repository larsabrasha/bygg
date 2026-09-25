import { describe, expect, it } from 'vitest'
import { anchorPoint, bodyCorners, layoutBalloons, overallSize, spread } from './drawing'
import { testBody } from './testFixtures'

describe('bodyCorners', () => {
  it('ger lådans åtta hörn i världen, flyttade', () => {
    // + 0 gör −0 till 0, så att jämförelsen inte skiljer på dem.
    const corners = bodyCorners(testBody(), [10, 0, 0]).map((c) => c.map((n) => n + 0))
    expect(corners).toHaveLength(8)
    // Golvet: u = +x, v = −z, n = +y.
    expect(corners).toContainEqual([10, 0, 0])
    expect(corners).toContainEqual([810, 22, -120])
  })
})

describe('overallSize', () => {
  it('mäter bredd, djup och höjd över alla delar utom verktyg', () => {
    const a = testBody({ id: 'a' })
    const b = testBody({ id: 'b', frame: { ...a.frame, origin: [0, 500, 0] } })
    const tool = testBody({ id: 't', profile: { x0: 0, y0: 0, x1: 5000, y1: 10 }, tool: { op: 'add', host: 'a' } })
    expect(overallSize([a, b, tool])).toEqual({ width: 800, depth: 120, height: 522 })
  })

  it('är null utan delar', () => {
    expect(overallSize([])).toBeNull()
  })
})

describe('spread', () => {
  it('lämnar lägen som står tillräckligt isär', () => {
    expect(spread([10, 50, 90], 0, 100, 20)).toEqual([10, 50, 90])
  })

  it('flyttar isär lägen som ligger för tätt, inom gränserna', () => {
    const ys = spread([50, 50, 50], 0, 100, 20)
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(20)
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(20)
    expect(Math.max(...ys)).toBeLessThanOrEqual(100)
  })

  it('trycker upp lägen som hamnar under nederkanten', () => {
    expect(spread([95, 99], 0, 100, 20)).toEqual([80, 100])
  })

  it('fördelar jämnt när de inte ryms', () => {
    expect(spread([0, 0, 0], 0, 10, 20)).toEqual([0, 5, 10])
  })
})

describe('layoutBalloons', () => {
  const content = { left: 100, right: 300, top: 50, bottom: 250 }
  const area = { width: 400, height: 300 }

  it('ställer ballongen på den sida av mitten där delen är, utanför det ritade', () => {
    const [left, right] = layoutBalloons(
      [
        { pos: 1, x: 120, y: 100 },
        { pos: 2, x: 280, y: 100 },
      ],
      content,
      area,
      10,
    )
    expect(left!.bx).toBeLessThan(content.left)
    expect(right!.bx).toBeGreaterThan(content.right)
    expect(left!.by).toBe(100)
  })

  it('behåller ordningen uppifrån, så att linjerna inte korsar varandra', () => {
    const balloons = layoutBalloons(
      [
        { pos: 1, x: 150, y: 200 },
        { pos: 2, x: 150, y: 198 },
        { pos: 3, x: 150, y: 202 },
      ],
      content,
      area,
      10,
    )
    const byPos = (p: number) => balloons.find((b) => b.pos === p)!.by
    expect(byPos(2)).toBeLessThan(byPos(1))
    expect(byPos(1)).toBeLessThan(byPos(3))
    expect(byPos(3) - byPos(1)).toBeGreaterThanOrEqual(20)
  })
})

describe('anchorPoint', () => {
  // Rutnät från text: # syns, . skyms.
  const grid = (rows: string[]) => rows.map((row, y) => [...row].map((c, x) => ({ x, y, seen: c === '#' })))

  it('pekar inte på mitten när den skyms, utan där delen syns', () => {
    const at = anchorPoint(grid(['#####', '##...', '##...', '##...', '#####']))
    expect(at).not.toBeNull()
    expect(grid(['#####', '##...', '##...', '##...', '#####'])[at!.y]![at!.x]!.seen).toBe(true)
  })

  it('väljer en punkt med synliga grannar framför en vid kanten', () => {
    const at = anchorPoint(grid(['.....', '.###.', '.###.', '.###.', '.....']))
    expect(at).toMatchObject({ x: 2, y: 2, seen: 9 })
  })

  it('är null när delen inte syns alls', () => {
    expect(anchorPoint(grid(['...', '...']))).toBeNull()
  })
})
