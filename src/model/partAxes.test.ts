import { describe, expect, it } from 'vitest'
import { axesFromLegacyGrain, defaultAxes, partDims, widthAxis, withAxes } from './partAxes'
import type { Rect } from './types'

const box = (x: number, y: number, z: number) => ({ profile: { x0: 0, y0: 0, x1: x, y1: y } as Rect, z0: 0, z1: z })

describe('defaultAxes', () => {
  it('fiber längs längsta, tjocklek längs kortaste', () => {
    expect(defaultAxes(box(800, 120, 22))).toEqual({ grainAxis: 'u', thicknessAxis: 'n' })
    expect(defaultAxes(box(22, 120, 800))).toEqual({ grainAxis: 'n', thicknessAxis: 'u' })
  })

  it('vid lika mått blir n tjockleken och u fibern', () => {
    expect(defaultAxes(box(100, 100, 100))).toEqual({ grainAxis: 'u', thicknessAxis: 'n' })
    expect(defaultAxes(box(500, 500, 22))).toEqual({ grainAxis: 'u', thicknessAxis: 'n' })
  })
})

describe('widthAxis', () => {
  it('är axeln som varken är fiber eller tjocklek', () => {
    expect(widthAxis({ grainAxis: 'n', thicknessAxis: 'u' })).toBe('v')
  })
})

describe('withAxes', () => {
  const current = { grainAxis: 'u', thicknessAxis: 'n' } as const

  it('byter fiber utan krock', () => {
    expect(withAxes(current, { grainAxis: 'v' })).toEqual({ grainAxis: 'v', thicknessAxis: 'n' })
  })

  it('fiber längs tjockleken: de byter plats', () => {
    expect(withAxes(current, { grainAxis: 'n' })).toEqual({ grainAxis: 'n', thicknessAxis: 'u' })
  })

  it('tjocklek längs fibern: de byter plats', () => {
    expect(withAxes(current, { thicknessAxis: 'u' })).toEqual({ grainAxis: 'n', thicknessAxis: 'u' })
  })
})

describe('partDims', () => {
  it('L längs fibern även om ett annat mått är större', () => {
    // Tvärgående skiva: fibern längs 300, men 900 bred.
    expect(partDims({ ...box(300, 900, 18), grainAxis: 'u', thicknessAxis: 'n' })).toEqual({
      length: 300,
      width: 900,
      thickness: 18,
    })
  })
})

describe('axesFromLegacyGrain', () => {
  it('översätter längs längden/bredden till axlar', () => {
    expect(axesFromLegacyGrain(box(800, 120, 22), 'length')).toEqual({ grainAxis: 'u', thicknessAxis: 'n' })
    expect(axesFromLegacyGrain(box(800, 120, 22), 'width')).toEqual({ grainAxis: 'v', thicknessAxis: 'n' })
  })
})
