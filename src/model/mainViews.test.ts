import { describe, expect, it } from 'vitest'
import { layoutMainViews } from './mainViews'

describe('layoutMainViews', () => {
  const layout = layoutMainViews({ width: 470, depth: 378, height: 538 })

  it('väljer en standardskala där tre vyer ryms ovanför titelrutan', () => {
    expect(layout.scale).toBe(10)
    for (const v of Object.values(layout.views)) {
      expect(v.x).toBeGreaterThanOrEqual(5)
      expect(v.y + v.h).toBeLessThanOrEqual(150)
    }
  })

  it('ställer vyerna i linje med varandra, som E-metoden', () => {
    const { front, side, top } = layout.views
    expect(side.y).toBe(front.y)
    expect(side.h).toBe(front.h)
    expect(top.x).toBe(front.x)
    expect(top.w).toBe(front.w)
    expect(side.x).toBeGreaterThan(front.x + front.w)
    expect(top.y).toBeGreaterThan(front.y + front.h)
  })

  it('har samma skala i alla vyer', () => {
    const { front, side, top } = layout.views
    const m = 2 * layout.margin
    expect((front.w - m) * layout.scale).toBeCloseTo(470)
    expect((side.w - m) * layout.scale).toBeCloseTo(378)
    expect((top.h - m) * layout.scale).toBeCloseTo(378)
  })

  it('måttsätter bredd, höjd och djup', () => {
    expect(layout.dims.map((d) => d.text)).toEqual(['470', '538', '378'])
  })
})
