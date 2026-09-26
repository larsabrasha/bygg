import { describe, expect, it } from 'vitest'
import {
  breakFor,
  breakpoints,
  canonicalGeometry,
  drawingPositions,
  featureSideUp,
  layoutPartSheet,
  partGeometry,
  scaleLabel,
  SHEET,
  wantedDetails,
} from './partSheet'
import { testBody } from './testFixtures'
import type { Body, ToolShape } from './types'

/** Titelrutans övre och vänstra kant, och ramens högra. */
const TITLE_TOP = SHEET.height - SHEET.frame - SHEET.title.height
const TITLE_LEFT = SHEET.width - SHEET.frame - SHEET.title.width
const FRAME_RIGHT = SHEET.width - SHEET.frame

/** Verktyg i formens koordinater, utan vridning. */
const tool = (
  op: ToolShape['op'],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): ToolShape => ({
  op,
  profile: { x0, y0, x1, y1 },
  z0,
  z1,
  frame: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
})

/** En sarg 800 × 120 × 22 (fiber längs u, tjocklek längs n) med en tapp på högra änden. */
const rail = (): Body =>
  testBody({
    tools: [tool('add', 800, 20, 6, 830, 100, 16)],
    blank: { profile: { x0: 0, y0: 0, x1: 830, y1: 120 }, z0: 0, z1: 22 },
  })

describe('partGeometry', () => {
  it('ger ämnet och verktygen i L, B och T', () => {
    const g = partGeometry(rail())
    expect(g.size).toEqual([830, 120, 22])
    expect(g.form).toEqual({ lo: [0, 0, 0], hi: [800, 120, 22] })
    expect(g.features).toEqual([{ op: 'add', lo: [800, 20, 6], hi: [830, 100, 16] }])
  })

  it('följer delens axlar, inte formens', () => {
    // Fiber längs v, tjocklek längs u.
    const g = partGeometry(
      testBody({ profile: { x0: 0, y0: 0, x1: 22, y1: 500 }, z1: 90, grainAxis: 'v', thicknessAxis: 'u' }),
    )
    expect(g.size).toEqual([500, 90, 22])
  })

  it('räknar från ämnets hörn, också när formen inte börjar i 0', () => {
    const g = partGeometry(testBody({ profile: { x0: 100, y0: 50, x1: 900, y1: 170 }, z0: 10, z1: 32 }))
    expect(g.form.lo).toEqual([0, 0, 0])
    expect(g.size).toEqual([800, 120, 22])
  })
})

describe('drawingPositions', () => {
  it('delar en kaplisterad med olika tappar i två positioner', () => {
    const plain = testBody({ id: 'a', name: 'Sarg bak' })
    const tenoned = {
      ...rail(),
      id: 'b',
      name: 'Sarg fram',
      blank: undefined,
      tools: [tool('subtract', 100, 20, 0, 130, 100, 22)],
    }
    const rows = drawingPositions([plain, tenoned, { ...tenoned, id: 'c' }])
    expect(rows.map((r) => [r.count, r.names])).toEqual([
      [1, ['Sarg bak']],
      [2, ['Sarg fram']],
    ])
  })

  it('lämnar likadana delar i samma position', () => {
    expect(drawingPositions([testBody({ id: 'a' }), testBody({ id: 'b' })])).toHaveLength(1)
  })
})

describe('breakpoints', () => {
  it('tar med tappens ansats och ände längs L', () => {
    expect(breakpoints(partGeometry(rail()), 0)).toEqual([0, 800, 830])
  })

  it('räknar ett hål bara inom formen', () => {
    const g = partGeometry(testBody({ tools: [tool('subtract', -50, 20, 0, 100, 60, 22)] }))
    expect(breakpoints(g, 0)).toEqual([0, 100, 800])
    expect(breakpoints(g, 1)).toEqual([0, 20, 60, 120])
  })
})

describe('layoutPartSheet', () => {
  it('väljer den största standardskalan där vyerna ryms', () => {
    expect(layoutPartSheet(partGeometry(rail())).scale).toBe(5)
    const small = testBody({ profile: { x0: 0, y0: 0, x1: 60, y1: 30 }, z1: 10 })
    expect(layoutPartSheet(partGeometry(small)).scale).toBe(0.5)
    expect(scaleLabel(0.5)).toBe('2:1')
    expect(scaleLabel(5)).toBe('1:5')
  })

  it('ritar ett hål streckat i vyer där det inte når sidan man ser', () => {
    // Inne i delen (T 5–15): når varken ovan- eller undersidan, eller kanterna.
    const inside = testBody({ tools: [tool('subtract', 100, 40, 5, 140, 80, 15)] })
    const holes = layoutPartSheet(partGeometry(inside)).shapes.filter((s) => s.w < 20 && s.h < 20)
    expect(holes.map((s) => s.style)).toEqual(['hidden', 'hidden', 'hidden'])
  })

  it('ritar en tapp som sticker ut som synlig i alla vyer där den syns utanför formen', () => {
    const { shapes } = layoutPartSheet(partGeometry(rail()))
    // Formen tre gånger och tappen tre gånger; i ändvyn (från vänstra änden) är tappen bakom delen.
    expect(shapes).toHaveLength(6)
    expect(shapes.filter((s) => s.style === 'hidden')).toHaveLength(1)
  })

  it('måttsätter L med kedja och totalmått när det finns en tapp', () => {
    const { dims } = layoutPartSheet(partGeometry(rail()))
    const horizontal = dims.filter((d) => !d.vertical).map((d) => d.text)
    expect(horizontal).toEqual(['800', '30', '830'])
  })

  it('har mått utan kedja för en slät del', () => {
    const { dims } = layoutPartSheet(partGeometry(testBody()))
    expect(dims.map((d) => d.text)).toEqual(['800', '120', '22'])
  })

  it('håller vyerna innanför ramen och ovanför titelrutan', () => {
    const { shapes } = layoutPartSheet(partGeometry({ ...testBody(), profile: { x0: 0, y0: 0, x1: 2400, y1: 600 } }))
    for (const s of shapes) {
      expect(s.x).toBeGreaterThanOrEqual(5)
      expect(s.x + s.w).toBeLessThanOrEqual(FRAME_RIGHT)
      expect(s.y + s.h).toBeLessThanOrEqual(TITLE_TOP)
    }
  })

  it('ritar ett runt genomgående hål som en cirkel med centrumlinjer i huvudvyn', () => {
    // Cylinderns axel längs formens n, som är delens T: huvudvyn ser längs den.
    const through = testBody({ tools: [{ ...tool('subtract', 380, 40, 0, 420, 80, 22), shape: 'circle' }] })
    const { shapes, lines } = layoutPartSheet(partGeometry(through))
    expect(shapes.filter((s) => s.kind === 'ellipse')).toHaveLength(1)
    expect(lines).toHaveLength(2)
  })
})

describe('featureSideUp', () => {
  it('vänder delen när knoppen sitter på den sida huvudvyn inte ser', () => {
    // Front T 22–40, knopp T 0–22 (på den låga sidan).
    const g = {
      size: [410, 164, 40] as [number, number, number],
      form: { lo: [0, 0, 22] as [number, number, number], hi: [410, 164, 40] as [number, number, number] },
      features: [
        {
          op: 'add' as const,
          lo: [190, 60, 0] as [number, number, number],
          hi: [220, 90, 22] as [number, number, number],
        },
      ],
    }
    const up = featureSideUp(g)
    expect(up.form).toEqual({ lo: [0, 0, 0], hi: [410, 164, 18] })
    expect(up.features[0]).toMatchObject({ lo: [190, 74, 18], hi: [220, 104, 40] })
  })

  it('lämnar delen när det mesta syns redan', () => {
    const g = partGeometry(testBody({ tools: [tool('subtract', 100, 40, 12, 140, 80, 22)] }))
    expect(featureSideUp(g)).toBe(g)
  })
})

describe('canonicalGeometry', () => {
  /** Ett ben 38 × 38 × 428 (fiber längs n) med ett tapphål i en sida. */
  const leg = (hole: ToolShape) =>
    partGeometry(
      testBody({
        profile: { x0: 0, y0: 0, x1: 38, y1: 38 },
        z1: 428,
        grainAxis: 'n',
        thicknessAxis: 'u',
        tools: [hole],
      }),
    )

  it('ger vridna likadana ben samma geometri', () => {
    // Samma hål på två olika sidor av benet, lika långt från toppen.
    const a = leg(tool('subtract', 0, 10, 380, 15, 28, 420))
    const b = leg(tool('subtract', 10, 23, 380, 28, 38, 420))
    expect(canonicalGeometry(a)).toEqual(canonicalGeometry(b))
  })

  it('ger en vänd del samma geometri, men skiljer spegelvända delar åt', () => {
    // Samma del vänd ett halvt varv runt T: hålet hamnar vid andra änden och andra kanten.
    const a = partGeometry(testBody({ tools: [tool('subtract', 50, 20, 0, 90, 60, 10)] }))
    const b = partGeometry(testBody({ tools: [tool('subtract', 710, 60, 0, 750, 100, 10)] }))
    expect(canonicalGeometry(a)).toEqual(canonicalGeometry(b))
    // Två hål i hörn på samma yta, men i spegelvänd ordning (stort vänster, litet höger mot tvärtom).
    const c = partGeometry(
      testBody({ tools: [tool('subtract', 50, 20, 12, 90, 60, 22), tool('subtract', 700, 80, 12, 720, 100, 22)] }),
    )
    const d = partGeometry(
      testBody({ tools: [tool('subtract', 710, 20, 12, 750, 60, 22), tool('subtract', 80, 80, 12, 100, 100, 22)] }),
    )
    expect(canonicalGeometry(c)).not.toEqual(canonicalGeometry(d))
  })
})

describe('breakFor', () => {
  it('ritar ett långt smalt ben avbrutet i större skala, med hela längden i måttet', () => {
    // Ben 428 × 38 × 38 med ett tapphål nära toppen.
    const g = partGeometry(
      testBody({
        profile: { x0: 0, y0: 0, x1: 428, y1: 38 },
        z1: 38,
        tools: [tool('subtract', 17, 12, 20, 73, 26, 38)],
      }),
    )
    const layout = layoutPartSheet(g)
    expect(layout.scale).toBeLessThan(5)
    expect(layout.breaks).toHaveLength(2)
    expect(layout.dims.filter((d) => !d.vertical).map((d) => d.text)).toContain('428')
    // Avbrottet ligger i den släta delen, inte i tapphålet.
    const hole = layout.shapes.find((s) => s.style === 'visible' && s.w < 60 && s.h < 20)!
    expect(layout.breaks[0]!.x).toBeGreaterThan(hole.x + hole.w)
  })

  it('bryter inte en bred del', () => {
    expect(layoutPartSheet(partGeometry(testBody({ profile: { x0: 0, y0: 0, x1: 520, y1: 350 } }))).breaks).toEqual([])
  })

  it('är null när den släta sträckan är för kort', () => {
    expect(breakFor([0, 100, 200, 300, 400], [400, 20, 20], { w: 100, h: 100 }, 5)).toBeNull()
  })
})

describe('detaljer', () => {
  it('ritar tappen på en sarg större, en gång fast den finns i båda ändar', () => {
    // Sarg 334 × 70 × 22 med tappar 25 lång, 7 tjock, 7,5 från sidorna, i båda ändar.
    const sarg = testBody({
      profile: { x0: 25, y0: 0, x1: 309, y1: 70 },
      z1: 22,
      tools: [tool('add', 0, 7, 7.5, 25, 63, 14.5), tool('add', 309, 7, 7.5, 334, 63, 14.5)],
      blank: { profile: { x0: 0, y0: 0, x1: 334, y1: 70 }, z0: 0, z1: 22 },
    })
    const layout = layoutPartSheet(partGeometry(sarg))
    expect(layout.scale).toBe(2)
    expect(layout.details).toHaveLength(1)
    const [a] = layout.details
    // 1:1, dubbelt så stort som vyerna i 1:2 (2:1 ryms inte bredvid dem på bladet).
    expect(a).toMatchObject({ letter: 'A', scale: 1 })
    // Tjockleken i kedjan: 7,5 + 7 + 7,5 och totalt 22.
    expect(a!.dims.filter((d) => d.vertical).map((d) => d.text)).toEqual(['7,5', '7', '7,5', '22'])
    // Detaljen står inte på titelrutan.
    expect(a!.clip.y + a!.clip.h <= TITLE_TOP || a!.clip.x + a!.clip.w <= TITLE_LEFT).toBe(true)
  })

  it('behövs inte när allt är stort nog på papperet', () => {
    const g = partGeometry(testBody({ tools: [tool('subtract', 100, 30, 0, 200, 90, 22)] }))
    expect(wantedDetails(g, 5)).toEqual([])
  })

  it('hoppar över en detalj som inte ryms någonstans', () => {
    // Ett hål 10 × 10 genom en skiva 1800 × 800: 1 mm på papperet i 1:10, men vyerna tar nästan hela bladet.
    const big = testBody({
      profile: { x0: 0, y0: 0, x1: 1800, y1: 800 },
      tools: [tool('subtract', 100, 100, 0, 110, 110, 22)],
    })
    const g = partGeometry(big)
    const layout = layoutPartSheet(g)
    expect(layout.scale).toBe(10)
    expect(wantedDetails(g, layout.scale)).toHaveLength(2)
    expect(layout.details).toEqual([])
  })
})
