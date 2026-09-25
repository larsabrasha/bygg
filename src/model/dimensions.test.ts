import { describe, expect, it } from 'vitest'
import { dimensionEdges } from './dimensions'
import { testBody } from './testFixtures'

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
