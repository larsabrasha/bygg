import { describe, expect, it } from 'vitest'
import { closestParamOnLine } from './vec'

describe('closestParamOnLine', () => {
  it('hittar punkten på linjen närmast en stråle som korsar den', () => {
    // Linje längs Y genom origo; stråle längs −Z som passerar y = 250.
    expect(closestParamOnLine([0, 0, 0], [0, 1, 0], [0, 250, 1000], [0, 0, -1])).toBeCloseTo(250)
  })

  it('fungerar med sned stråle', () => {
    const r: [number, number, number] = [0, -Math.SQRT1_2, -Math.SQRT1_2]
    // Strålen från (0, 1100, 1000) når z = 0 vid y = 100.
    expect(closestParamOnLine([0, 0, 0], [0, 1, 0], [0, 1100, 1000], r)).toBeCloseTo(100)
  })

  it('ger null när linje och stråle är parallella', () => {
    expect(closestParamOnLine([0, 0, 0], [0, 1, 0], [0, 500, 0], [0, -1, 0])).toBeNull()
  })
})
