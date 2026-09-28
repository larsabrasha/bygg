import { describe, expect, it } from 'vitest'
import { matchesSearch } from './modelSearch'

describe('sökning i startvyn', () => {
  it('hittar alla ord, i vilken ordning som helst och utan hänsyn till versaler', () => {
    expect(matchesSearch('Bokhylla i ek', 'EK bok')).toBe(true)
    expect(matchesSearch('Bokhylla i ek', 'hylla björk')).toBe(false)
    expect(matchesSearch('Bokhylla', '  ')).toBe(true)
  })

  it('å, ä och ö är egna bokstäver', () => {
    expect(matchesSearch('Sängbord', 'ÄNG')).toBe(true)
    expect(matchesSearch('Sangbord', 'säng')).toBe(false)
  })
})
