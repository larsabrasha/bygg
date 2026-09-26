import { describe, expect, it } from 'vitest'
import { hoverColor } from './colors'

describe('hoverColor', () => {
  it('samma färg, ljusare', () => {
    expect(hoverColor('#000000')).toBe('#737373')
    expect(hoverColor('#ffffff')).toBe('#ffffff')
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hoverColor('#1e6fd9').slice(i, i + 2), 16))
    expect(r! > 0x1e && g! > 0x6f && b! > 0xd9).toBe(true)
    expect(b! > g! && g! > r!).toBe(true)
  })
})
