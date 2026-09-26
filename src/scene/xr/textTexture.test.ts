import { describe, expect, it } from 'vitest'
import { wrap } from './textTexture'

// Ett tecken är en enhet brett.
const len = (s: string) => s.length

describe('wrap', () => {
  it('bryter på ord så att raderna får plats', () => {
    expect(wrap('Dra i pilen eller skriv måttet', len, 12)).toEqual(['Dra i pilen', 'eller skriv', 'måttet'])
  })
  it('ny rad vid \\n, och bryter varje rad för sig', () => {
    expect(wrap('Spak  gå\nA ångra B gör om', len, 8)).toEqual(['Spak gå', 'A ångra', 'B gör om'])
  })
  it('tom text ger en tom rad', () => {
    expect(wrap('', len, 10)).toEqual([''])
  })
})
