import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import { beforeNeutral, neutral } from './neutralToneMap'

describe('beforeNeutral', () => {
  it('ger en färg som blir den tänkta efter exponering och tonmappning', () => {
    for (const hex of ['#e6e3de', '#3a3733']) {
      const c = beforeNeutral(hex, 1.5)
      const out = neutral([c.r * 1.5, c.g * 1.5, c.b * 1.5])
      const want = new Color(hex)
      expect(out[0]).toBeCloseTo(want.r, 3)
      expect(out[1]).toBeCloseTo(want.g, 3)
      expect(out[2]).toBeCloseTo(want.b, 3)
    }
  })

  it('lämnar mörka färger nästan linjära', () => {
    expect(neutral([0.3, 0.2, 0.1])[0]).toBeCloseTo(0.26, 2)
  })
})
