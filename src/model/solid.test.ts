import Module from 'manifold-3d'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ManifoldToplevel } from 'manifold-3d'
import { faceOnBox } from './geometry'
import { buildSolid, DRAG_SEGMENTS, SEGMENTS, type SolidMesh } from './solid'
import type { Frame, ToolShape } from './types'

let api: ManifoldToplevel
beforeAll(async () => {
  api = await Module()
  api.setup()
})

/** Volymen innanför en sluten yta (divergenssatsen). */
function volume({ positions: p, indices: ix }: SolidMesh): number {
  let v = 0
  for (let t = 0; t < ix.length; t += 3) {
    const [a, b, c] = [ix[t]! * 3, ix[t + 1]! * 3, ix[t + 2]! * 3]
    v +=
      (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
        p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
        p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
      6
  }
  return v
}

const identity = (origin: Frame['origin']): Frame => ({ origin, u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] })
const leg = { profile: { x0: 0, y0: 0, x1: 40, y1: 40 }, z0: 0, z1: 800 }

describe('former med verktyg', () => {
  it('skär ut ett tapphål', () => {
    const mortise: ToolShape = {
      op: 'subtract',
      profile: { x0: 0, y0: 0, x1: 10, y1: 30 },
      z0: 0,
      z1: 25,
      frame: identity([15, 5, 700]),
    }
    const mesh = buildSolid(api, leg, [mortise])
    expect(volume(mesh)).toBeCloseTo(40 * 40 * 800 - 10 * 30 * 25, 0)
  })

  it('lägger till en tapp, och tillägg räknas före urskärningar', () => {
    const tenon: ToolShape = {
      op: 'add',
      profile: { x0: 0, y0: 0, x1: 10, y1: 20 },
      z0: 0,
      z1: 30,
      frame: identity([15, 10, 800]),
    }
    // Ett hål rakt igenom tappen och benets topp.
    const hole: ToolShape = {
      op: 'subtract',
      shape: 'circle',
      profile: { x0: -4, y0: -4, x1: 4, y1: 4 },
      z0: 0,
      z1: 60,
      frame: { origin: [0, 20, 815], u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] },
    }
    expect(volume(buildSolid(api, leg, [tenon]))).toBeCloseTo(40 * 40 * 800 + 10 * 20 * 30, 0)
    const both = volume(buildSolid(api, leg, [hole, tenon]))
    // Hålet (Ø 8, 10 långt genom tappen) tas ur tappen: tappen lades till först.
    expect(both).toBeLessThan(40 * 40 * 800 + 10 * 20 * 30 - 400)
  })

  it('en cylinder med ett hål genom sig', () => {
    const round = { ...leg, shape: 'circle' as const }
    const drill: ToolShape = {
      op: 'subtract',
      shape: 'circle',
      profile: { x0: -5, y0: -5, x1: 5, y1: 5 },
      z0: -10,
      z1: 810,
      frame: identity([20, 20, 0]),
    }
    const v = volume(buildSolid(api, round, [drill]))
    // 64 segment ger lite mindre än en riktig cirkel.
    expect(v / (Math.PI * (20 * 20 - 5 * 5) * 800)).toBeCloseTo(1, 2)
  })

  it('en träff räknas till formens egen sida, men inte inne i ett hål', () => {
    expect(faceOnBox(leg, [20, 20, 800], [0, 0, 1])).toBe('n+')
    expect(faceOnBox(leg, [40, 10, 300], [1, 0, 0])).toBe('u+')
    // Botten av ett tapphål på 25 mm djup: normalen uppåt men inte på toppen.
    expect(faceOnBox(leg, [20, 20, 775], [0, 0, 1])).toBeUndefined()
    const round = { ...leg, shape: 'circle' as const }
    expect(faceOnBox(round, [40, 20, 300], [1, 0, 0])).toBe('u+')
    expect(faceOnBox(round, [30, 20, 300], [1, 0, 0])).toBeUndefined()
  })
})

describe('medan man drar', () => {
  const hole: ToolShape = {
    op: 'subtract',
    shape: 'circle',
    profile: { x0: -10, y0: -10, x1: 10, y1: 10 },
    z0: 0,
    z1: 30,
    frame: identity([20, 20, 0]),
  }
  const board = { profile: { x0: 0, y0: 0, x1: 400, y1: 250 }, z0: 0, z1: 30 }

  it('färre segment ger färre trianglar, och ungefär samma volym', () => {
    const fine = buildSolid(api, board, [hole])
    const rough = buildSolid(api, board, [hole], DRAG_SEGMENTS)
    expect(rough.indices.length).toBeLessThan(fine.indices.length / 2)
    expect(volume(rough)).toBeCloseTo(volume(fine), -3)
    expect(SEGMENTS).toBeGreaterThan(DRAG_SEGMENTS)
  })

  it('samma verktyg på en form som växer ger samma hål (verktygen sparas mellan anropen)', () => {
    const a = buildSolid(api, board, [hole])
    const b = buildSolid(api, { ...board, z1: 60 }, [hole])
    // Den tjockare skivan: 30 mm mer trä, och hålet är lika stort som förut.
    expect(volume(b) - volume(a)).toBeCloseTo(400 * 250 * 30, -1)
  })
})
