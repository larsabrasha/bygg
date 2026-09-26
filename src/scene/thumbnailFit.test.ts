import { describe, expect, it } from 'vitest'
import { fitDistance } from './thumbnailFit'

describe('fitDistance', () => {
  it('ställer kameran längre bort när utsnittet är en mindre del av ytan', () => {
    const full = fitDistance(100, 35, 800, 600, { x: 0, y: 0, w: 800, h: 600 })
    const half = fitDistance(100, 35, 800, 600, { x: 200, y: 150, w: 400, h: 300 })
    expect(half).toBeGreaterThan(full * 1.9)
  })
  it('låter sfären precis rymmas i höjdled, med marginal', () => {
    const d = fitDistance(100, 90, 600, 600, { x: 0, y: 0, w: 600, h: 600 }, 1)
    // Halv synvinkel 45°: sfären tangerar när sin(45°) · d = r.
    expect(d).toBeCloseTo(100 / Math.sin(Math.PI / 4))
  })
})
