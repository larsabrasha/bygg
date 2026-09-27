import { describe, expect, it } from 'vitest'
import { buildCutPlan } from '../model/cutPlan'
import { buildCutList } from '../model/cutlist'
import { drawingPositions } from '../model/partSheet'
import { testBody } from '../model/testFixtures'
import { buildDrawingPdf, type DrawingPdfInput } from './drawingPdf'

/** Sidornas storlek i punkter, i ordning, ur PDF:ens text. */
async function pageSizes(blob: Blob): Promise<string[]> {
  const pdf = new TextDecoder('latin1').decode(await blob.arrayBuffer())
  return [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(([, w, h]) =>
    Number(w) > Number(h) ? 'liggande' : 'stående',
  )
}

const bodiesOf = (parts: number) =>
  Array.from({ length: parts }, (_, i) =>
    testBody({ id: `b${i}`, name: `Del ${i + 1}`, profile: { x0: 0, y0: 0, x1: 300 + i * 10, y1: 120 } }),
  )

function input(parts: number): DrawingPdfInput {
  // Olika längder: en rad per del i både stycklistan och kaplistan.
  const bodies = bodiesOf(parts)
  return {
    name: 'Provmodell',
    date: '2026-09-26',
    sheets: 3,
    size: '800 × 120 × 22',
    positions: drawingPositions(bodies),
    cutList: buildCutList(bodies),
    svgSheets: [],
  }
}

describe('buildDrawingPdf', () => {
  it('sammanställningen liggande och kaplistan stående', async () => {
    expect(await pageSizes(await buildDrawingPdf(input(3)))).toEqual(['liggande', 'stående'])
  })

  it('en lång kaplista fortsätter på fler stående sidor', async () => {
    const pages = await pageSizes(await buildDrawingPdf(input(60)))
    expect(pages[0]).toBe('liggande')
    expect(pages.length).toBeGreaterThan(2)
    expect(pages.slice(1).every((p) => p === 'stående')).toBe(true)
  })

  it('kapschemat sist, liggande, och fler sidor när brädorna inte ryms', async () => {
    const one = { ...input(3), sheets: 4, cutPlan: buildCutPlan(bodiesOf(3)) }
    expect(await pageSizes(await buildDrawingPdf(one))).toEqual(['liggande', 'stående', 'liggande'])
    // 60 delar på 2400-brädor: långt fler brädor än ryms på en sida.
    const many = { ...input(60), sheets: 4, cutPlan: buildCutPlan(bodiesOf(60)) }
    const pages = await pageSizes(await buildDrawingPdf(many))
    expect(pages.at(-1)).toBe('liggande')
    expect(pages.at(-2)).toBe('liggande')
  })
})
