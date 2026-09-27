import { describe, expect, it } from 'vitest'
import { fitsBin, packGuillotine, type PackItem, type Placed } from './guillotine'

const SHEET = { width: 2440, height: 1220 }

const items = (n: number, width: number, height: number, rotatable = false, name = 'del'): PackItem<string>[] =>
  Array.from({ length: n }, (_, i) => ({ width, height, rotatable, data: `${name}${i}` }))

/** Ingen bit utanför skivan, och minst ett sågblad mellan två bitar. */
function expectValid(bins: Placed<string>[][], kerf: number, bin = SHEET) {
  for (const placed of bins) {
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x + p.width).toBeLessThanOrEqual(bin.width)
      expect(p.y + p.height).toBeLessThanOrEqual(bin.height)
      for (const q of placed) {
        if (p === q) continue
        const apart =
          p.x + p.width + kerf <= q.x ||
          q.x + q.width + kerf <= p.x ||
          p.y + p.height + kerf <= q.y ||
          q.y + q.height + kerf <= p.y
        expect(apart, `${p.data} och ${q.data}`).toBe(true)
      }
    }
  }
}

describe('packGuillotine', () => {
  it('ger inga skivor utan bitar', () => {
    expect(packGuillotine(SHEET, [], 3)).toEqual([])
  })

  it('lägger fyra kvartsskivor på en skiva när sågbladet är 0', () => {
    const bins = packGuillotine(SHEET, items(4, 1220, 610), 0)
    expect(bins).toHaveLength(1)
    expectValid(bins, 0)
  })

  it('räknar med sågbladet mellan bitarna', () => {
    // Exakta kvartar: två i rad blir 2443 lång med 3 mm blad, så bara en per skiva.
    expect(packGuillotine(SHEET, items(4, 1220, 610), 3)).toHaveLength(4)
    // Med bladets bredd borträknad går alla fyra på en: 1218 + 3 + 1218 = 2439.
    const bins = packGuillotine(SHEET, items(4, 1218, 608), 3)
    expect(bins).toHaveLength(1)
    expectValid(bins, 3)
  })

  it('vrider bara bitar som får vridas', () => {
    const skap = [
      ...items(2, 560, 720, false, 'sida'),
      ...items(2, 560, 764, false, 'botten'),
      ...items(3, 540, 760, false, 'hylla'),
      ...items(1, 800, 720, false, 'rygg'),
    ]
    const fixed = packGuillotine(SHEET, skap, 3)
    expect(fixed.flat().every((p) => !p.rotated)).toBe(true)
    expectValid(fixed, 3)

    const free = packGuillotine(
      SHEET,
      skap.map((i) => ({ ...i, rotatable: true })),
      3,
    )
    expect(free.length).toBeLessThan(fixed.length)
    expectValid(free, 3)
    for (const p of free.flat().filter((p) => p.rotated)) {
      const item = skap.find((i) => i.data === p.data)!
      expect([p.width, p.height]).toEqual([item.height, item.width])
    }
  })

  it('packar smala delar sida vid sida på en bräda', () => {
    const board = { width: 2400, height: 145 }
    // Tre ben 45 breda går i bredd på en 145-bräda (45 + 3 + 45 + 3 + 45 = 141).
    const bins = packGuillotine(board, items(6, 1100, 45), 3)
    expect(bins).toHaveLength(1)
    expectValid(bins, 3, board)
  })

  it('behåller varje bit en gång', () => {
    const all = [...items(7, 300, 200, true, 'a'), ...items(5, 900, 400, false, 'b')]
    const bins = packGuillotine(SHEET, all, 3)
    expect(
      bins
        .flat()
        .map((p) => p.data)
        .sort(),
    ).toEqual(all.map((i) => i.data).sort())
  })
})

describe('fitsBin', () => {
  it('tar hänsyn till om biten får vridas', () => {
    const tall = { width: 1000, height: 2000, data: '', rotatable: false }
    expect(fitsBin(SHEET, tall)).toBe(false)
    expect(fitsBin(SHEET, { ...tall, rotatable: true })).toBe(true)
  })
})
