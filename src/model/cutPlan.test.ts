import { describe, expect, it } from 'vitest'
import { buildCutPlan, defaultStock, isPanel, purchaseList, stockKey } from './cutPlan'
import { testBody } from './testFixtures'
import type { Body } from './types'

/** En del L×B×T längs fibern (u), bredden (v) och tjockleken (n). */
const part = (id: string, length: number, width: number, thickness: number, extra: Partial<Body> = {}) =>
  testBody({ id, name: id, profile: { x0: 0, y0: 0, x1: length, y1: width }, z0: 0, z1: thickness, ...extra })

describe('defaultStock', () => {
  it('ger en hel skiva för plywood', () => {
    expect(defaultStock('plywood', [{ length: 500, width: 300 }])).toEqual({ length: 2440, width: 1220 })
  })

  it('ger den smalaste bräda som räcker för den bredaste delen', () => {
    expect(
      defaultStock('furu', [
        { length: 700, width: 45 },
        { length: 900, width: 90 },
      ]),
    ).toEqual({
      length: 2400,
      width: 95,
    })
  })

  it('ger en limfogsskiva när ingen bräda är bred nog, och längre när delen är längre', () => {
    expect(defaultStock('ek', [{ length: 1800, width: 420 }])).toEqual({ length: 2400, width: 600 })
    expect(defaultStock('ek', [{ length: 2500, width: 820 }])).toEqual({ length: 2700, width: 900 })
  })
})

describe('buildCutPlan', () => {
  it('ger en grupp per material och tjocklek', () => {
    const plan = buildCutPlan([
      part('ben1', 700, 45, 45),
      part('ben2', 700, 45, 45),
      part('sarg', 900, 95, 22),
      part('topp', 1000, 600, 18, { material: 'plywood' }),
    ])
    expect(plan.groups.map((g) => g.key)).toEqual([stockKey('furu', 45), stockKey('furu', 22), stockKey('plywood', 18)])
    expect(
      plan.groups[0]!.boards.flat()
        .map((p) => p.bodyId)
        .sort(),
    ).toEqual(['ben1', 'ben2'])
    expect(plan.kerf).toBe(3)
  })

  it('lägger delens längd längs brädans längd, också när delen står i modellen', () => {
    const standing = part('ben', 45, 45, 700, { grainAxis: 'n', thicknessAxis: 'u' })
    const piece = buildCutPlan([standing]).groups[0]!.boards[0]![0]!
    expect(piece).toMatchObject({ length: 700, width: 45, rotated: false })
  })

  it('använder inställt lagermått och sågblad', () => {
    const parts = [part('a', 1200, 95, 22), part('b', 1200, 95, 22)]
    const key = stockKey('furu', 22)
    const board = { length: 2400, width: 95, trim: 0 }
    // 1200 + 3 + 1200 är längre än 2400: två brädor.
    expect(buildCutPlan(parts, { sizes: { [key]: board } }).groups[0]!.boards).toHaveLength(2)
    // Utan sågblad går båda på en.
    const group = buildCutPlan(parts, { kerf: 0, sizes: { [key]: board } }).groups[0]!
    expect(group.boards).toHaveLength(1)
    expect(group.isDefault).toBe(false)
    expect(group.waste).toBeCloseTo(0)
  })

  it('kapar ändarna på massivt trä men låter sidorna vara', () => {
    const group = buildCutPlan([part('ben', 700, 45, 45)], {
      sizes: { [stockKey('furu', 45)]: { length: 2400, width: 45, trim: 25 } },
    }).groups[0]!
    // En 45 bred del går på en 45 bred bräda, och ligger efter den kapade änden.
    expect(group.boards[0]![0]).toMatchObject({ x: 25, y: 0 })
    // 2400 - 2 × 25 = 2350 räcker inte för 2360.
    const long = buildCutPlan([part('lång', 2360, 45, 45)], {
      sizes: { [stockKey('furu', 45)]: { length: 2400, width: 45, trim: 25 } },
    }).groups[0]!
    expect(long.tooBig).toHaveLength(1)
  })

  it('rensar alla kanter på en skiva', () => {
    const key = stockKey('plywood', 18)
    const group = buildCutPlan([part('a', 500, 300, 18, { material: 'plywood' })]).groups[0]!
    expect(group.stock.trim).toBe(10)
    expect(group.boards[0]![0]).toMatchObject({ x: 10, y: 10 })
    // En hel skiva som del får inte plats när kanterna rensas, men väl utan rensning.
    const whole = [part('hel', 2440, 1220, 18, { material: 'plywood' })]
    expect(buildCutPlan(whole).groups[0]!.tooBig).toHaveLength(1)
    const untrimmed = buildCutPlan(whole, { sizes: { [key]: { length: 2440, width: 1220, trim: 0 } } })
    expect(untrimmed.groups[0]!.boards).toHaveLength(1)
  })

  it('lägger kapmånen på delens längd men visar det färdiga måttet', () => {
    const plan = buildCutPlan([part('ben', 700, 45, 45)], { lengthAllowance: 20 })
    expect(plan.lengthAllowance).toBe(20)
    expect(plan.groups[0]!.boards[0]![0]).toMatchObject({ w: 720, h: 45, length: 700, width: 45 })
  })

  it('väljer en längre bräda när delen och de kapade ändarna inte ryms på 2400', () => {
    const group = buildCutPlan([part('lång', 2380, 95, 22)]).groups[0]!
    // 2380 + 2 × 20 = 2420: nästa längd är 2700.
    expect(group.stock).toMatchObject({ length: 2700, trim: 20 })
    expect(group.boards).toHaveLength(1)
  })

  it('vrider bara plywood, och bara när det är inställt', () => {
    // 1300 lång del längs fibern går inte på en 1220 bred skiva, men väl vriden.
    const tall = [part('a', 1000, 1300, 18, { material: 'plywood' })]
    const key = stockKey('plywood', 18)
    const sizes = (rotate: boolean) => ({ [key]: { length: 1220, width: 2440, rotate } })
    expect(buildCutPlan(tall, { sizes: sizes(false) }).groups[0]!.boards[0]![0]!.rotated).toBe(false)
    const turned = [part('a', 2000, 1000, 18, { material: 'plywood' })]
    expect(buildCutPlan(turned, { sizes: sizes(false) }).groups[0]!.tooBig).toHaveLength(1)
    expect(buildCutPlan(turned, { sizes: sizes(true) }).groups[0]!.boards[0]![0]!.rotated).toBe(true)
    // Massivt trä vrids aldrig, inte ens om rotate står i inställningen.
    const oak = [part('a', 2000, 1000, 18, { material: 'ek' })]
    const oakKey = stockKey('ek', 18)
    const oakPlan = buildCutPlan(oak, { sizes: { [oakKey]: { length: 1220, width: 2440, rotate: true } } })
    expect(oakPlan.groups[0]!.tooBig).toHaveLength(1)
  })

  it('lägger delar som inte får plats för sig', () => {
    const plan = buildCutPlan([part('lång', 3000, 95, 22), part('kort', 500, 95, 22)], {
      sizes: { [stockKey('furu', 22)]: { length: 2400, width: 95 } },
    })
    const group = plan.groups[0]!
    expect(group.tooBig.map((p) => p.name)).toEqual(['lång'])
    expect(group.boards.flat().map((p) => p.name)).toEqual(['kort'])
  })

  it('tar inte med verktyg', () => {
    const tool = part('tapp', 40, 20, 10, { tool: { op: 'add', host: 'x' } })
    expect(buildCutPlan([tool]).groups).toEqual([])
  })
})

describe('isPanel', () => {
  it('är skiva för skivmaterial och för massivt trä bredare än en bräda', () => {
    expect(isPanel({ sheet: true, stock: { length: 2440, width: 1220 } })).toBe(true)
    expect(isPanel({ sheet: false, stock: { length: 2400, width: 195 } })).toBe(false)
    expect(isPanel({ sheet: false, stock: { length: 2400, width: 600 } })).toBe(true)
  })
})

describe('purchaseList', () => {
  it('ger antal och mått per lagermått, med löpmeter för brädor', () => {
    const plan = buildCutPlan([
      part('ben1', 1300, 45, 45),
      part('ben2', 1300, 45, 45),
      part('sida', 720, 560, 18, { material: 'plywood' }),
    ])
    // Två 1300-ben går inte på en 2400-bräda i längd, och inte bredvid varandra på en 45 bred.
    // Tusentalsavgränsaren är ett hårt mellanslag; här jämförs den som vanligt mellanslag.
    const plain = (s?: string) => s?.replace(/\s/g, ' ')
    expect(purchaseList(plan).map(({ text, length }) => [plain(text), plain(length)])).toEqual([
      ['2 brädor furu 45 × 45 × 2 400', '4,8 m'],
      ['1 skiva plywood 18 × 1 220 × 2 440', undefined],
    ])
  })

  it('tar inte med grupper där inget fick plats', () => {
    const plan = buildCutPlan([part('lång', 3000, 95, 22)], {
      sizes: { [stockKey('furu', 22)]: { length: 2400, width: 95 } },
    })
    expect(purchaseList(plan)).toEqual([])
  })
})
