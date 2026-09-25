import { describe, expect, it } from 'vitest'
import { faceBounds, faceFrame, GROUND_FRAME, toLocal, toWorld } from './frame'
import { testBody } from './testFixtures'
import { FACES, type Frame, type Vec3 } from './types'
import { cross, dot, length } from './vec'

function expectVecClose(a: Vec3, b: Vec3) {
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!))
}

function expectOrthonormalRightHanded(f: Frame) {
  for (const a of [f.u, f.v, f.n]) expect(length(a)).toBeCloseTo(1)
  expect(dot(f.u, f.v)).toBeCloseTo(0)
  expectVecClose(cross(f.u, f.v), f.n)
}

// Kropp 800 × 120 × 22 som står på golvet, x 0..800, y 0..120, z 0..22 i golvframen.
const body = testBody()

describe('frames', () => {
  it('golvframen är högerorienterad med n uppåt', () => {
    expectOrthonormalRightHanded(GROUND_FRAME)
    expect(GROUND_FRAME.n).toEqual([0, 1, 0])
  })

  it('toWorld och toLocal är varandras invers', () => {
    const f = faceFrame(body, 'u-')
    const p: Vec3 = [12, -34, 56]
    expectVecClose(toLocal(f, toWorld(f, p)), p)
  })

  it.each(FACES)('sidan %s får en högerorienterad frame', (face) => {
    expectOrthonormalRightHanded(faceFrame(body, face))
  })

  it.each(FACES)('sidan %s: n pekar ut från kroppens mitt, och origo ligger i sidans plan', (face) => {
    const f = faceFrame(body, face)
    const center = toWorld(body.frame, [400, 60, 11])
    // Mitten ska ligga på negativa sidan av planet.
    expect(toLocal(f, center)[2]).toBeLessThan(0)
    // Sidans hörn ligger i planet (z = 0).
    const b = faceBounds(body, face)
    for (const [x, y] of [
      [b.x0, b.y0],
      [b.x1, b.y1],
    ] as const) {
      const w = toWorld(f, [x, y, 0])
      expect(toLocal(f, w)[2]).toBeCloseTo(0)
    }
  })

  it('ovansidans utsträckning motsvarar profilen', () => {
    expect(faceBounds(body, 'n+')).toEqual({ x0: 0, y0: 0, x1: 800, y1: 120 })
    const top = faceFrame(body, 'n+')
    expect(top.origin).toEqual([0, 22, 0])
  })

  it('kortsidans utsträckning motsvarar bredd × tjocklek', () => {
    const b = faceBounds(body, 'u+')
    expect(b.x1 - b.x0).toBeCloseTo(120)
    expect(b.y1 - b.y0).toBeCloseTo(22)
  })
})
