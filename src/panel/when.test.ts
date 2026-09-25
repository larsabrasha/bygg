import { describe, expect, it } from 'vitest'
import { shortWhen } from './when'

describe('shortWhen', () => {
  // Lokal tid, så att testet inte beror på tidszonen.
  const now = new Date(2026, 8, 25, 14, 0)
  const at = (y: number, m: number, d: number, h = 6, min = 20) => new Date(y, m, d, h, min).toISOString()

  it('visar bara klockslaget i dag', () => {
    expect(shortWhen(at(2026, 8, 25), now)).toBe('06:20')
  })
  it('skriver igår', () => {
    expect(shortWhen(at(2026, 8, 24, 23, 5), now)).toBe('igår 23:05')
  })
  it('visar dag och månad i år, och hela datumet för äldre', () => {
    expect(shortWhen(at(2026, 0, 3), now)).toMatch(/^3 jan/)
    expect(shortWhen(at(2025, 8, 25), now)).toBe('2025-09-25')
  })
})
