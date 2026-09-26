import { describe, expect, it } from 'vitest'
import { aces } from './acesToneMap'

describe('aces', () => {
  it('ger svart för svart och vitt för mycket ljus', () => {
    for (const v of aces([0, 0, 0])) expect(v).toBeCloseTo(0, 3)
    for (const v of aces([100, 100, 100])) expect(v).toBeCloseTo(1, 2)
  })

  it('ljusare in ger ljusare ut, och exponeringen gör bilden ljusare', () => {
    expect(aces([0.4, 0.4, 0.4])[0]).toBeGreaterThan(aces([0.2, 0.2, 0.2])[0])
    expect(aces([0.2, 0.2, 0.2], 1.5)[0]).toBeGreaterThan(aces([0.2, 0.2, 0.2])[0])
  })

  it('stämmer med three.js för mellangrått (räknat för hand ur shadern)', () => {
    // 0.18 / 0.6 = 0.3 in; RRTAndODTFit(0.3) ≈ 0.2131, och matriserna lämnar grått grått
    // (varje rad summerar till 1).
    expect(aces([0.18, 0.18, 0.18])[1]).toBeCloseTo(0.2131, 3)
  })
})
