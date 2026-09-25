import { describe, expect, it } from 'vitest'
import { dimensionEdges } from './dimensions'
import { testBody } from './testFixtures'
import type { Vec3 } from './types'

// Del 800 × 120 × 22 på golvet: u = X, v = −Z, n = Y (uppåt).
const body = testBody()

describe('dimensionEdges', () => {
  it('väljer kanterna vid hörnet närmast kameran och flyttar ut måtten från delen', () => {
    // Kameran framför, till höger och ovanför.
    const [u, v, n] = dimensionEdges(body, [2000, 1000, 1000])
    // Längden längs den främre, övre kanten.
    expect(u).toMatchObject({ axis: 'u', from: [0, 22, 0], to: [800, 22, 0] })
    expect(u!.out[1]).toBeGreaterThan(0)
    expect(u!.out[2]).toBeGreaterThan(0)
    // Bredden längs högra övre kanten, tjockleken i främre högra hörnet.
    expect(v).toMatchObject({ axis: 'v', from: [800, 22, 0], to: [800, 22, -120] })
    expect(n).toMatchObject({ axis: 'n', from: [800, 0, 0], to: [800, 22, 0] })
  })

  it('byter kant när kameran går runt delen', () => {
    const [u] = dimensionEdges(body, [400, -1000, -3000])
    expect(u).toMatchObject({ from: [0, 0, -120], to: [800, 0, -120] })
    expect(u!.out[1]).toBeLessThan(0)
  })
})

describe('dimensionEdges för en cylinder', () => {
  // Liggande cylinder längs X: Ø 100, längd 400. Profilen i YZ-planet, n = X.
  const frame = { origin: [0, 50, 0] as Vec3, u: [0, 0, 1] as Vec3, v: [0, 1, 0] as Vec3, n: [1, 0, 0] as Vec3 }
  const cyl = (z1: number) =>
    testBody({ shape: 'circle', frame, profile: { x0: -50, y0: -50, x1: 50, y1: 50 }, z0: 0, z1 })

  it('sätter längden på den undre konturen, inte på linjen närmast kameran', () => {
    // Kameran framför och ovanför: konturen ligger tvärs mot riktningen dit.
    const [, n] = dimensionEdges(cyl(400), [200, 800, 800])
    expect(n!.axis).toBe('n')
    expect(n!.out[1]).toBeLessThan(0)
  })

  it('byter inte sida när längden ändras under ett drag', () => {
    const sides = [300, 350, 400, 450, 500].map((z1) => Math.sign(dimensionEdges(cyl(z1), [200, 800, 800])[1]!.out[1]!))
    expect(new Set(sides)).toEqual(new Set([-1]))
  })

  it('en stående cylinder får måttet på konturen till höger sett från kameran', () => {
    const standing = testBody({ shape: 'circle', profile: { x0: -50, y0: -50, x1: 50, y1: 50 }, z0: 0, z1: 400 })
    // Golvframen: n = Y. Kameran framför (+Z): höger är +X.
    const [, n] = dimensionEdges(standing, [0, 200, 1000])
    expect(n!.out[0]).toBeGreaterThan(0.9)
  })
})
