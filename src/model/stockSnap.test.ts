import { describe, expect, it } from 'vitest'
import { snapStock, stockThicknesses, thicknessTargets } from './stockSnap'

describe('tjocklekar som finns att köpa', () => {
  it('plywood, hyvlat virke eller limfog efter material och bredd', () => {
    expect(stockThicknesses('plywood', 600)).toMatchObject({ source: 'Plywood' })
    expect(stockThicknesses('furu', 95)).toEqual({ thicknesses: [22, 28, 34, 45, 70, 95], source: 'Hyvlat virke' })
    expect(stockThicknesses('furu', 400)).toEqual({ thicknesses: [18, 27], source: 'Limfog av furu' })
    expect(stockThicknesses('ek', 400).thicknesses).toEqual([20, 27, 40])
  })

  it('en skiss: båda hållen, bara tjocklekar som inte är större än bredden', () => {
    const t = thicknessTargets('furu', 30, { bothWays: true, max: 30 })
    expect(t.map((x) => x.distance)).toEqual([22, -22, 28, -28])
    expect(t[0]!.text).toBe('Hyvlat virke finns i 22')
  })

  it('en dels sida: från nuvarande tjocklek, inte tunnare än min', () => {
    const t = thicknessTargets('plywood', 600, { base: 15, min: -13 })
    expect(t.map((x) => x.distance)).toEqual([-11, -8.5, -6, -3, 3, 6, 9])
    expect(t.find((x) => x.distance === -8.5)!.text).toBe('Plywood finns i 6,5')
  })

  it('snäpper i en smal zon, så att måtten mellan går att dra fram', () => {
    const t = thicknessTargets('furu', 95)
    expect(snapStock(21, t, 5)?.thickness).toBe(22)
    // Zonen är en fjärdedel av avståndet till grannen: 1,5 mellan 22 och 28.
    expect(snapStock(23.4, t, 5)?.thickness).toBe(22)
    expect(snapStock(24, t, 5)).toBeNull()
    expect(snapStock(25, t, 5)).toBeNull()
    // Aldrig mer än 2 mm, och aldrig mer än zone.
    expect(snapStock(47.5, t, 5)).toBeNull()
    expect(snapStock(21, t, 0.5)).toBeNull()
    // Plywoodens tjocklekar ligger tätt: 16 och 17 går att dra fram mellan 15 och 18.
    const p = thicknessTargets('plywood', 600)
    expect(snapStock(15.6, p, 5)?.thickness).toBe(15)
    expect(snapStock(16, p, 5)).toBeNull()
    expect(snapStock(17, p, 5)).toBeNull()
  })
})
