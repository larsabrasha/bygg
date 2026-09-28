import { describe, expect, it } from 'vitest'
import { supportPlane } from './support'
import { testBody } from './testFixtures'
import type { Body, Frame, Vec3 } from './types'

/** Låda med hörnet närmast origo i at och måtten size längs x, y och z. */
function box(id: string, at: Vec3, size: Vec3): Body {
  const frame: Frame = { origin: at, u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }
  return testBody({ id, frame, profile: { x0: 0, y0: 0, x1: size[0], y1: size[1] }, z0: 0, z1: size[2] })
}

const normalOf = (f: Frame | null) => f && f.n.map((x) => Math.abs(Math.round(x)))

describe('supportPlane', () => {
  const floorCabinet = box('skåp', [0, 0, 0], [600, 1800, 400])
  const wall = box('vägg', [-1000, 0, -100], [4000, 2400, 100])

  it('en möbel på golvet glider längs golvet, också när den står mot en vägg', () => {
    expect(normalOf(supportPlane([floorCabinet], [wall]))).toEqual([0, 1, 0])
  })

  it('en låda på en hylla glider längs hyllan', () => {
    const shelf = box('hylla', [0, 700, 0], [800, 22, 300])
    const crate = box('låda', [100, 722, 50], [200, 150, 200])
    expect(normalOf(supportPlane([crate], [shelf]))).toEqual([0, 1, 0])
  })

  it('en tavla mot en vägg glider längs väggen', () => {
    const painting = box('tavla', [500, 1200, 0], [600, 400, 20])
    expect(normalOf(supportPlane([painting], [wall]))).toEqual([0, 0, 1])
  })

  it('inget stöd: fritt i luften, med en glipa, eller bara kant mot kant', () => {
    expect(supportPlane([box('fri', [0, 500, 500], [100, 100, 100])], [wall])).toBeNull()
    expect(supportPlane([box('glipa', [500, 1200, 5], [600, 400, 20])], [wall])).toBeNull()
    // Nuddar väggens ovankant bara längs en kant.
    expect(supportPlane([box('kant', [0, 2400, -200], [100, 100, 100])], [wall])).toBeNull()
  })

  it('flera valda: står en av dem på golvet glider alla längs golvet', () => {
    const top = box('skiva', [0, 1800, 0], [600, 22, 400])
    expect(normalOf(supportPlane([top, floorCabinet], []))).toEqual([0, 1, 0])
  })
})
