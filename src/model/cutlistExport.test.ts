import { describe, expect, it } from 'vitest'
import { buildCutList } from './cutlist'
import { compactNames, compactNumbers, cutListCsv, cutListFileName, formatMm } from './cutlistExport'
import { testBody } from './testFixtures'

const lines = (csv: string) => csv.replace(/^\uFEFF/, '').split('\r\n')

describe('cutListCsv', () => {
  it('börjar med BOM och rubrikrad, semikolon mellan fälten', () => {
    const csv = cutListCsv(buildCutList([]))
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(lines(csv)).toEqual(['Antal;Namn;Längd (mm);Bredd (mm);Tjocklek (mm);Material', ''])
  })

  it('en rad per grupp med antal och L, B, T i egna kolumner', () => {
    const list = buildCutList([testBody({ id: 'a', name: 'Ben' }), testBody({ id: 'b', name: 'Ben' })])
    expect(lines(cutListCsv(list))[1]).toBe('2;Ben;800;120;22;furu')
  })

  it('skriver decimalkomma och inga tusentalsavgränsare', () => {
    const list = buildCutList([testBody({ profile: { x0: 0, y0: 0, x1: 1200, y1: 95.5 }, z1: 22 })])
    expect(lines(cutListCsv(list))[1]).toBe('1;Del 1;1200;95,5;22;furu')
  })

  it('citerar fält med semikolon eller citattecken', () => {
    const list = buildCutList([testBody({ name: 'Sida; vänster "A"' })])
    expect(lines(cutListCsv(list))[1]).toBe('1;"Sida; vänster ""A""";800;120;22;furu')
  })

  it('slår ihop olika namn i samma grupp med komma, utan att citera', () => {
    const list = buildCutList([testBody({ id: 'a', name: 'Ben' }), testBody({ id: 'b', name: 'Slå' })])
    expect(lines(cutListCsv(list))[1]).toBe('2;Ben, Slå;800;120;22;furu')
  })
})

describe('formatMm', () => {
  it('visar högst en decimal', () => {
    expect(formatMm(22)).toBe('22')
    expect(formatMm(12.25)).toBe('12,3')
    expect(formatMm(1800)).toBe('1800')
  })
})

describe('cutListFileName', () => {
  it('använder modellens namn', () => {
    expect(cutListFileName('Bänk', 'csv')).toBe('Bänk – kaplista.csv')
  })

  it('tar bort tecken som inte får finnas i filnamn', () => {
    expect(cutListFileName('Min modell (konflikt 2026-09-25 01:35)', 'csv')).toBe(
      'Min modell (konflikt 2026-09-25 0135) – kaplista.csv',
    )
    expect(cutListFileName('a/b\\c?', 'csv')).toBe('abc – kaplista.csv')
  })

  it('faller tillbaka på bara "kaplista" utan namn', () => {
    expect(cutListFileName('  ', 'csv')).toBe('kaplista.csv')
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
