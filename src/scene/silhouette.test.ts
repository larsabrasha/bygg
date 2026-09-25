import { describe, expect, it } from 'vitest'
import { tangentPoints } from './silhouette'

describe('tangentPoints', () => {
  it('ger två punkter på cirkeln där linjen från kameran tangerar den', () => {
    const [a, b] = tangentPoints([0, 0], 10, [50, 0])!
    for (const [x, y] of [a, b]) {
      expect(Math.hypot(x, y)).toBeCloseTo(10)
      // Tangent: radien är vinkelrät mot linjen till kameran.
      expect(x * (50 - x) + y * (0 - y)).toBeCloseTo(0)
    }
    expect(a[1]).toBeCloseTo(-b[1])
  })

  it('går mot sidorna av cirkeln när kameran är långt bort, som i parallellprojektion', () => {
    const [a] = tangentPoints([0, 0], 10, [1e6, 0])!
    expect(a[0]).toBeCloseTo(0, 3)
    expect(Math.abs(a[1])).toBeCloseTo(10)
  })

  it('är null när kameran står innanför cirkeln', () => {
    expect(tangentPoints([0, 0], 10, [5, 0])).toBeNull()
  })
})
