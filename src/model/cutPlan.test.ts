import { describe, expect, it } from 'vitest'
import {
  buildCutPlan,
  defaultStocks,
  groupCount,
  isPanel,
  nextStock,
  purchaseList,
  stockKey,
  type CutPlanGroup,
  type StockLayout,
} from './cutPlan'
import { testBody } from './testFixtures'
import type { Body } from './types'

/** En del L×B×T längs fibern (u), bredden (v) och tjockleken (n). */
const part = (id: string, length: number, width: number, thickness: number, extra: Partial<Body> = {}) =>
  testBody({ id, name: id, profile: { x0: 0, y0: 0, x1: length, y1: width }, z0: 0, z1: thickness, ...extra })

/** Alla skivor och brädor i gruppen, oavsett lagermått. */
const boardsOf = (g: CutPlanGroup) => g.stocks.flatMap((l) => l.boards)

/** Namnen på delarna som kapas ur ett lagermått, i bokstavsordning. */
const names = (l: StockLayout) =>
  l.boards
    .flat()
    .map((p) => p.name)
    .sort()

describe('defaultStocks', () => {
  it('ger en hel skiva för plywood', () => {
    expect(defaultStocks('plywood', [{ length: 500, width: 300 }])).toEqual([{ length: 2440, width: 1220 }])
  })

  it('ger den smalaste bräda som räcker för den bredaste delen', () => {
    expect(
      defaultStocks('furu', [
        { length: 700, width: 45 },
        { length: 900, width: 90 },
      ]),
      // 900 + 2 × 20 kapade ändar ryms på den kortaste standardlängden, 1 800.
    ).toEqual([{ length: 1800, width: 95 }])
  })

  it('ger en limfogsskiva när ingen bräda är bred nog, och längre när delen är längre', () => {
    // Vanliga mått på limfogsskivor, och inga kapade ändar: en bordsskiva om 1800 får en skiva om 1800.
    expect(defaultStocks('ek', [{ length: 1800, width: 420 }])).toEqual([{ length: 1800, width: 500 }])
    expect(defaultStocks('ek', [{ length: 1800, width: 900 }])).toEqual([{ length: 1800, width: 900 }])
    // Längre än 2400 finns inte som limfog i sortimentet: 2500 avrundas till 2700.
    expect(defaultStocks('ek', [{ length: 2500, width: 820 }])).toEqual([{ length: 2700, width: 900 }])
    // Kapmånen räknas med: 1820 kräver 2000.
    expect(defaultStocks('ek', [{ length: 1800, width: 900 }], 20)).toEqual([{ length: 2000, width: 900 }])
  })

  it('ger både en bräda och en limfogsskiva när delarna är både smala och breda', () => {
    expect(
      defaultStocks('ek', [
        { length: 900, width: 95 },
        { length: 1100, width: 650 },
      ]),
    ).toEqual([
      { length: 1800, width: 95 },
      { length: 1200, width: 800 },
    ])
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
      boardsOf(plan.groups[0]!)
        .flat()
        .map((p) => p.bodyId)
        .sort(),
    ).toEqual(['ben1', 'ben2'])
    expect(plan.kerf).toBe(3)
  })

  it('lägger delens längd längs brädans längd, också när delen står i modellen', () => {
    const standing = part('ben', 45, 45, 700, { grainAxis: 'n', thicknessAxis: 'u' })
    const piece = boardsOf(buildCutPlan([standing]).groups[0]!)[0]![0]!
    expect(piece).toMatchObject({ length: 700, width: 45, rotated: false })
  })

  it('använder inställt lagermått och sågblad', () => {
    const parts = [part('a', 1200, 95, 22), part('b', 1200, 95, 22)]
    const key = stockKey('furu', 22)
    const board = { length: 2400, width: 95, trim: 0 }
    // 1200 + 3 + 1200 är längre än 2400: två brädor.
    expect(boardsOf(buildCutPlan(parts, { sizes: { [key]: [board] } }).groups[0]!)).toHaveLength(2)
    // Utan sågblad går båda på en.
    const group = buildCutPlan(parts, { kerf: 0, sizes: { [key]: [board] } }).groups[0]!
    expect(boardsOf(group)).toHaveLength(1)
    expect(group.isDefault).toBe(false)
    expect(group.waste).toBeCloseTo(0)
  })

  it('kapar ändarna på massivt trä men låter sidorna vara', () => {
    const group = buildCutPlan([part('ben', 700, 45, 45)], {
      sizes: { [stockKey('furu', 45)]: [{ length: 2400, width: 45, trim: 25 }] },
    }).groups[0]!
    // En 45 bred del går på en 45 bred bräda, och ligger efter den kapade änden.
    expect(boardsOf(group)[0]![0]).toMatchObject({ x: 25, y: 0 })
    // 2400 - 2 × 25 = 2350 räcker inte för 2360.
    const long = buildCutPlan([part('lång', 2360, 45, 45)], {
      sizes: { [stockKey('furu', 45)]: [{ length: 2400, width: 45, trim: 25 }] },
    }).groups[0]!
    expect(long.tooBig).toHaveLength(1)
  })

  it('rensar alla kanter på en skiva', () => {
    const key = stockKey('plywood', 18)
    const group = buildCutPlan([part('a', 500, 300, 18, { material: 'plywood' })]).groups[0]!
    expect(group.stocks[0]!.stock.trim).toBe(10)
    expect(boardsOf(group)[0]![0]).toMatchObject({ x: 10, y: 10 })
    // En hel skiva som del får inte plats när kanterna rensas, men väl utan rensning.
    const whole = [part('hel', 2440, 1220, 18, { material: 'plywood' })]
    expect(buildCutPlan(whole).groups[0]!.tooBig).toHaveLength(1)
    const untrimmed = buildCutPlan(whole, { sizes: { [key]: [{ length: 2440, width: 1220, trim: 0 }] } })
    expect(boardsOf(untrimmed.groups[0]!)).toHaveLength(1)
  })

  it('lägger kapmånen på delens längd men visar det färdiga måttet', () => {
    const plan = buildCutPlan([part('ben', 700, 45, 45)], { lengthAllowance: 20 })
    expect(plan.lengthAllowance).toBe(20)
    expect(boardsOf(plan.groups[0]!)[0]![0]).toMatchObject({ w: 720, h: 45, length: 700, width: 45 })
  })

  it('väljer en längre bräda när delen och de kapade ändarna inte ryms på 2400', () => {
    const group = buildCutPlan([part('lång', 2380, 95, 22)]).groups[0]!
    // 2380 + 2 × 20 = 2420: nästa längd är 2700.
    expect(group.stocks[0]!.stock).toMatchObject({ length: 2700, trim: 20 })
    expect(boardsOf(group)).toHaveLength(1)
  })

  it('vrider bara plywood, och bara när det är inställt', () => {
    // 1300 lång del längs fibern går inte på en 1220 bred skiva, men väl vriden.
    const tall = [part('a', 1000, 1300, 18, { material: 'plywood' })]
    const key = stockKey('plywood', 18)
    const sizes = (rotate: boolean) => ({ [key]: [{ length: 1220, width: 2440, rotate }] })
    expect(boardsOf(buildCutPlan(tall, { sizes: sizes(false) }).groups[0]!)[0]![0]!.rotated).toBe(false)
    const turned = [part('a', 2000, 1000, 18, { material: 'plywood' })]
    expect(buildCutPlan(turned, { sizes: sizes(false) }).groups[0]!.tooBig).toHaveLength(1)
    expect(boardsOf(buildCutPlan(turned, { sizes: sizes(true) }).groups[0]!)[0]![0]!.rotated).toBe(true)
    // Massivt trä vrids aldrig, inte ens om rotate står i inställningen.
    const oak = [part('a', 2000, 1000, 18, { material: 'ek' })]
    const oakKey = stockKey('ek', 18)
    const oakPlan = buildCutPlan(oak, { sizes: { [oakKey]: [{ length: 1220, width: 2440, rotate: true }] } })
    expect(oakPlan.groups[0]!.tooBig).toHaveLength(1)
  })

  it('lägger delar som inte får plats för sig', () => {
    const plan = buildCutPlan([part('lång', 3000, 95, 22), part('kort', 500, 95, 22)], {
      sizes: { [stockKey('furu', 22)]: [{ length: 2400, width: 95 }] },
    })
    const group = plan.groups[0]!
    expect(group.tooBig.map((p) => p.name)).toEqual(['lång'])
    expect(
      boardsOf(group)
        .flat()
        .map((p) => p.name),
    ).toEqual(['kort'])
  })

  it('kapar varje del ur det smalaste lagermått den ryms på', () => {
    const table = [
      part('skiva', 1100, 650, 22, { material: 'ek' }),
      part('sarg1', 900, 95, 22, { material: 'ek' }),
      part('sarg2', 900, 95, 22, { material: 'ek' }),
    ]
    // Standard: en bräda för sargarna och en limfogsskiva för bordsskivan. Sargarna ryms inte i
    // spillet på skivan (bara en av dem), så brädan står kvar.
    const group = buildCutPlan(table).groups[0]!
    expect(group.isDefault).toBe(true)
    expect(group.stocks.map((l) => [l.stock.width, l.panel, names(l)])).toEqual([
      [95, false, ['sarg1', 'sarg2']],
      [800, true, ['skiva']],
    ])
    expect(groupCount(group)).toBe('1 skiva · 1 bräda')

    // Vid lika bredd det kortaste som räcker.
    const lengths = buildCutPlan([part('kort', 500, 95, 22), part('lång', 2800, 95, 22)], {
      sizes: {
        [stockKey('furu', 22)]: [
          { length: 3000, width: 95 },
          { length: 1200, width: 95 },
        ],
      },
    }).groups[0]!
    expect(lengths.stocks.map(names)).toEqual([['lång'], ['kort']])
  })

  it('kapar hellre ur spillet på en skiva man ändå köper än ur en egen bräda', () => {
    const table = [
      part('skiva', 1100, 650, 22, { material: 'ek' }),
      part('sarg1', 900, 95, 22, { material: 'ek' }),
      part('sarg2', 900, 95, 22, { material: 'ek' }),
    ]
    // En stor skiva har plats för sargarna bredvid bordsskivan: brädan behövs inte.
    const set = buildCutPlan(table, {
      sizes: {
        [stockKey('ek', 22)]: [
          { length: 2400, width: 800 },
          { length: 2400, width: 145 },
        ],
      },
    }).groups[0]!
    // Inställda mått står kvar, också det som inget kapas ur.
    expect(set.stocks.map(names)).toEqual([['sarg1', 'sarg2', 'skiva'], []])
    expect(groupCount(set)).toBe('1 skiva')
  })

  it('spill går att välja bort per grupp, och det står vilka delar det gäller', () => {
    const shelf = [
      ...[1, 2].map((i) => part(`sida${i}`, 1800, 300, 22)),
      ...[1, 2, 3, 4, 5].map((i) => part(`hylla${i}`, 756, 280, 22)),
      part('sockel', 756, 70, 22),
    ]
    const on = buildCutPlan(shelf).groups[0]!
    expect(on.leftover).toBe(true)
    expect(on.moved.map((p) => [p.name, p.toPanel, p.fromPanel])).toEqual([['sockel', true, false]])

    const off = buildCutPlan(shelf, { noLeftover: [stockKey('furu', 22)] }).groups[0]!
    expect(off.leftover).toBe(false)
    // Sockeln får en egen bräda; raden om den står kvar, så att valet går att ändra tillbaka.
    expect(off.stocks.map((l) => [l.panel, names(l).includes('sockel')])).toEqual([
      [false, true],
      [true, false],
    ])
    expect(off.moved.map((p) => p.name)).toEqual(['sockel'])
  })

  it('matbord: förslaget väljer den säljlängd som ger minst att köpa', () => {
    const table = [
      ...[1, 2, 3, 4].map((i) => part(`ben${i}`, 720, 70, 70, { material: 'ek' })),
      ...[1, 2].map((i) => part(`lång${i}`, 1600, 100, 22, { material: 'ek' })),
      ...[1, 2].map((i) => part(`kort${i}`, 700, 100, 22, { material: 'ek' })),
      part('skiva', 1800, 900, 28, { material: 'ek' }),
    ]
    const [legs, top, rails] = buildCutPlan(table).groups
    // Fyra ben på en bräda om 3000 (4 × 720 + 3 × 3 + 2 × 20 = 2929), inte två om 2400.
    expect(legs!.stocks.map((l) => [l.stock.length, l.boards.length])).toEqual([[3000, 1]])
    // Bordsskivan på en limfogsskiva i sitt eget mått, utan spill.
    expect(top!.stocks.map((l) => [l.stock.length, l.stock.width, l.boards.length])).toEqual([[1800, 900, 1]])
    expect(top!.waste).toBeCloseTo(0)
    // En lång och en kort sarg per bräda om 2400 räcker; längre brädor ger inte mindre att köpa.
    expect(rails!.stocks.map((l) => [l.stock.length, l.boards.length])).toEqual([[2400, 2]])
  })

  it('bokhylla: sockeln kapas ur spillet på en hyllskiva', () => {
    const shelf = [
      ...[1, 2].map((i) => part(`sida${i}`, 1800, 300, 22)),
      ...[1, 2, 3, 4, 5].map((i) => part(`hylla${i}`, 756, 280, 22)),
      part('sockel', 756, 70, 22),
    ]
    const group = buildCutPlan(shelf).groups[0]!
    // Limfogsskivor 1800 × 300: en per sida och två hyllor per skiva; sockeln på den sista hyllskivans spill.
    // Förslaget om en bräda för sockeln visas inte, eftersom inget kapas ur den.
    expect(group.stocks.map((l) => [l.stock.length, l.stock.width])).toEqual([[1800, 300]])
    expect(groupCount(group)).toBe('5 skivor')
  })

  it('tar inte med verktyg', () => {
    const tool = part('tapp', 40, 20, 10, { tool: { op: 'add', host: 'x' } })
    expect(buildCutPlan([tool]).groups).toEqual([])
  })
})

describe('isPanel', () => {
  it('är skiva för skivmaterial och för massivt trä bredare än en bräda', () => {
    expect(isPanel(true, { length: 2440, width: 1220 })).toBe(true)
    expect(isPanel(false, { length: 2400, width: 195 })).toBe(false)
    expect(isPanel(false, { length: 2400, width: 600 })).toBe(true)
  })
})

describe('purchaseList', () => {
  it('ger antal och mått per lagermått, med löpmeter för brädor', () => {
    const plan = buildCutPlan([
      part('ben1', 1300, 45, 45),
      part('ben2', 1300, 45, 45),
      part('sida', 720, 560, 18, { material: 'plywood' }),
    ])
    // Två 1300-ben ryms inte på en 2400-bräda, men på en om 2700: 1300 + 3 + 1300 + 2 × 20 = 2643.
    // Tusentalsavgränsaren är ett hårt mellanslag; här jämförs den som vanligt mellanslag.
    const plain = (s?: string) => s?.replace(/\s/g, ' ')
    expect(purchaseList(plan).map(({ text, length }) => [plain(text), plain(length)])).toEqual([
      ['1 bräda furu 45 × 45 × 2 700', '2,7 m'],
      ['1 skiva plywood 18 × 1 220 × 2 440', undefined],
    ])
  })

  it('tar inte med grupper där inget fick plats', () => {
    const plan = buildCutPlan([part('lång', 3000, 95, 22)], {
      sizes: { [stockKey('furu', 22)]: [{ length: 2400, width: 95 }] },
    })
    expect(purchaseList(plan)).toEqual([])
  })
})

describe('nextStock', () => {
  it('föreslår ett mått som räcker för delar som inte får plats', () => {
    const table = [part('skiva', 1100, 650, 22, { material: 'ek' }), part('sarg', 900, 95, 22, { material: 'ek' })]
    const group = buildCutPlan(table, { sizes: { [stockKey('ek', 22)]: [{ length: 2400, width: 95 }] } }).groups[0]!
    expect(group.tooBig.map((p) => p.name)).toEqual(['skiva'])
    expect(nextStock(group, 0)).toEqual({ length: 1200, width: 800 })
  })

  it('föreslår en bräda, sedan en limfogsskiva, sedan en kopia', () => {
    const sizes = (list: { length: number; width: number }[]) => ({ sizes: { [stockKey('ek', 22)]: list } })
    const sarg = [part('sarg', 900, 95, 22, { material: 'ek' })]
    const panelOnly = buildCutPlan(sarg, sizes([{ length: 2400, width: 600 }])).groups[0]!
    expect(nextStock(panelOnly, 0)).toEqual({ length: 2400, width: 95 })
    const boardOnly = buildCutPlan(sarg, sizes([{ length: 2400, width: 145 }])).groups[0]!
    expect(nextStock(boardOnly, 0)).toEqual({ length: 2400, width: 600 })
    const both = buildCutPlan(
      sarg,
      sizes([
        { length: 2400, width: 145 },
        { length: 1800, width: 600 },
      ]),
    ).groups[0]!
    // En limfogsskiva kapas inte i ändarna: kopian får samma.
    expect(nextStock(both, 0)).toEqual({ length: 1800, width: 600, trim: 0 })
  })
})

describe('svenska standardmått', () => {
  it('köper den minsta standardtjocklek som räcker och säger att delarna hyvlas ner', () => {
    const plan = buildCutPlan([
      part('hylla', 700, 95, 20),
      part('skiva', 1000, 400, 22),
      part('botten', 500, 400, 20, { material: 'plywood' }),
      part('ben', 700, 45, 45),
    ])
    const plain = (s?: string) => s?.replace(/\s/g, ' ')
    expect(purchaseList(plan).map(({ text, note }) => [plain(text), plain(note)])).toEqual([
      // Hyvlat virke: 45 finns, 20 köps som 22.
      ['1 bräda furu 45 × 45 × 1 800', undefined],
      // Limfog av furu finns i 18 och 27: en del om 22 kräver 27.
      ['1 skiva furu 27 × 400 × 1 200', 'delarna 22 mm; limfog finns i 18 och 27'],
      ['1 bräda furu 22 × 95 × 1 800', 'delarna 20 mm, hyvlas ner'],
      // Plywood: 20 köps som 21.
      ['1 skiva plywood 21 × 1 220 × 2 440', 'delarna 20 mm; plywood finns i 18 och 21'],
    ])
  })

  it('limfog av lövträ har andra tjocklekar än barrträ', () => {
    const plan = buildCutPlan([part('skiva', 1000, 400, 22, { material: 'ek' }), part('topp', 1000, 400, 19)])
    expect(plan.groups.map((g) => g.stocks[0]!.thickness)).toEqual([27, 27])
    const thin = buildCutPlan([part('skiva', 1000, 400, 18, { material: 'ek' })])
    // Ek finns i 20, inte 18.
    expect(thin.groups[0]!.stocks[0]!.thickness).toBe(20)
  })

  it('räknar 220 som bräda och bredare som limfogsskiva', () => {
    expect(isPanel(false, { length: 2400, width: 220 })).toBe(false)
    expect(defaultStocks('furu', [{ length: 900, width: 210 }])).toEqual([{ length: 1800, width: 220 }])
    expect(defaultStocks('furu', [{ length: 900, width: 230 }])).toEqual([{ length: 1200, width: 300 }])
  })
})
