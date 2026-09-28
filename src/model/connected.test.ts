import { describe, expect, it } from 'vitest'
import { connectedParts } from './connected'
import { testBody } from './testFixtures'
import type { Body, Frame, Vec3 } from './types'

function box(id: string, at: Vec3, size: Vec3, extra: Partial<Body> = {}): Body {
  const frame: Frame = { origin: at, u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }
  return testBody({ id, frame, profile: { x0: 0, y0: 0, x1: size[0], y1: size[1] }, z0: 0, z1: size[2], ...extra })
}

describe('connectedParts', () => {
  // En pall: fyra ben under en sits, och en fristående låda bredvid på golvet.
  const legs = [
    box('ben1', [0, 0, 0], [40, 400, 40]),
    box('ben2', [360, 0, 0], [40, 400, 40]),
    box('ben3', [0, 0, 360], [40, 400, 40]),
    box('ben4', [360, 0, 360], [40, 400, 40]),
  ]
  const seat = box('sits', [0, 400, 0], [400, 22, 400])
  const crate = box('låda', [600, 0, 0], [300, 300, 300])

  it('väljer allt som sitter ihop, via andra delar, men inte det som bara står på samma golv', () => {
    const all = [...legs, seat, crate]
    expect(connectedParts(all, 'ben1').sort()).toEqual(['ben1', 'ben2', 'ben3', 'ben4', 'sits'])
    // Den man klickade på står sist: den blir den valda.
    expect(connectedParts(all, 'ben1').at(-1)).toBe('ben1')
    expect(connectedParts(all, 'låda')).toEqual(['låda'])
  })

  it('delar som går in i varandra sitter ihop; en glipa gör att de inte gör det', () => {
    const side = box('sida', [0, 0, 0], [18, 800, 300])
    const shelf = box('hylla', [10, 300, 0], [400, 18, 300])
    expect(connectedParts([side, shelf], 'hylla').sort()).toEqual(['hylla', 'sida'])
    const loose = box('lös', [30, 300, 0], [400, 18, 300])
    expect(connectedParts([side, loose], 'lös')).toEqual(['lös'])
  })

  it('en tapp binder ihop sarg och ben men blir inte själv vald', () => {
    const leg = box('ben', [0, 0, 0], [40, 700, 40])
    const apron = box('sarg', [50, 600, 0], [400, 80, 20])
    const tenon = box('tapp', [30, 610, 5], [30, 60, 10], { tool: { op: 'joint', host: 'sarg', into: 'ben' } })
    expect(connectedParts([leg, apron, tenon], 'sarg').sort()).toEqual(['ben', 'sarg'])
  })
})
