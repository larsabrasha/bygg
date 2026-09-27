import { describe, expect, it } from 'vitest'
import { compactNames, compactNumbers, formatMm } from './cutlistExport'

describe('formatMm', () => {
  it('visar högst en decimal', () => {
    expect(formatMm(22)).toBe('22')
    expect(formatMm(12.25)).toBe('12,3')
    expect(formatMm(1800)).toBe('1800')
  })
})

describe('compactNumbers', () => {
  it('skriver tre eller fler i följd som ett intervall', () => {
    expect(compactNumbers([4, 2, 3, 1, 7])).toBe('1–4, 7')
    expect(compactNumbers([10, 11])).toBe('10, 11')
    expect(compactNumbers([1, 2, 3, 5, 6, 7, 9])).toBe('1–3, 5–7, 9')
    expect(compactNumbers([3, 3])).toBe('3')
    expect(compactNumbers([])).toBe('')
  })
})

describe('compactNames', () => {
  it('skriver det gemensamma första ordet en gång', () => {
    expect(compactNames(['Sarg fram', 'Sarg bak', 'Sarg vänster'])).toBe('Sarg fram, bak, vänster')
  })

  it('räknar bara hela ord som gemensamma', () => {
    expect(compactNames(['Sarg fram', 'Sargen bak'])).toBe('Sarg fram, Sargen bak')
    expect(compactNames(['Sarg', 'Sarg bak'])).toBe('Sarg, Sarg bak')
  })

  it('lämnar ett ensamt namn orört', () => {
    expect(compactNames(['Sarg fram'])).toBe('Sarg fram')
  })
})
