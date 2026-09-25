import { describe, expect, it } from 'vitest'
import { ACROSS_MM, GRAIN_MM, grainUvs, hash01 } from './grainUv'

describe('grainUvs', () => {
  it('lägger u längs fibern på en sida där fibern ligger i planet', () => {
    // Två hörn på ovansidan (normal +z), fibern längs x.
    const uv = grainUvs([0, 0, 22, 600, 150, 22], [0, 0, 1, 0, 0, 1], 0)
    expect([...uv]).toEqual([0, 0, 1, 1])
  })

  it('följer fibern när den går längs en annan axel', () => {
    // Samma ovansida, fibern längs y: u följer y, v följer x.
    const uv = grainUvs([150, 600, 22], [0, 0, 1], 1)
    expect(uv[0]).toBeCloseTo(600 / GRAIN_MM)
    expect(uv[1]).toBeCloseTo(150 / ACROSS_MM)
  })

  it('ger ändträ på en ände, där fibern går rakt ut', () => {
    // Änden (normal +x) med fibern längs x.
    const uv = grainUvs([800, 150, 22], [1, 0, 0], 0)
    expect(uv[0]).toBeCloseTo(150 / ACROSS_MM)
    expect(uv[1]).toBeCloseTo(22 / ACROSS_MM)
  })

  it('flyttar mönstret med offset', () => {
    expect([...grainUvs([0, 0, 0], [0, 0, 1], 0, [0.25, 0.5])]).toEqual([0.25, 0.5])
  })
})

describe('hash01', () => {
  it('ger samma tal för samma text, och olika för olika', () => {
    expect(hash01('a')).toBe(hash01('a'))
    expect(hash01('a')).not.toBe(hash01('b'))
    expect(hash01('a')).toBeGreaterThanOrEqual(0)
    expect(hash01('a')).toBeLessThan(1)
  })
})
