import { describe, expect, it } from 'vitest'
import { buildCutList } from './cutlist'
import { compactNames, compactNumbers, cutListCsv, formatMm } from './cutlistExport'
import { testBody } from './testFixtures'

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

describe('cutListCsv', () => {
  it('semikolon, decimalkomma och BOM, en rad per rad i kaplistan', () => {
    const rows = buildCutList([
      testBody({ id: 'a', name: 'Hylla; lång', profile: { x0: 0, y0: 0, x1: 800.25, y1: 120 } }),
      testBody({ id: 'b', name: 'Hylla; lång', profile: { x0: 0, y0: 0, x1: 800.25, y1: 120 } }),
      testBody({
        id: 'c',
        name: 'Pinne',
        grainAxis: 'n',
        thicknessAxis: 'u',
        shape: 'circle',
        profile: { x0: 0, y0: 0, x1: 20, y1: 20 },
        z1: 400,
        paint: { color: '#ffffff', code: 'NCS S 0502-Y' },
      }),
    ]).rows
    const csv = cutListCsv(rows, (m) => m.toUpperCase())
    expect(csv.startsWith('\uFEFFAntal;Namn;Material;')).toBe(true)
    const lines = csv.slice(1).trimEnd().split('\r\n')
    expect(lines).toHaveLength(3)
    // Semikolon i namnet: inom citattecken.
    expect(lines).toContain('2;"Hylla; lång";FURU;800,3;120;22;;;0,004226')
    expect(lines.find((l) => l.includes('Pinne'))).toMatch(/^1;Pinne;FURU;400;20;20;20;NCS S 0502-Y;/)
  })
})
