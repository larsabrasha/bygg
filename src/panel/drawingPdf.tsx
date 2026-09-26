import { jsPDF } from 'jspdf'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { groupByMaterial, type CutList, type CutListRow } from '../model/cutlist'
import { compactNames, compactNumbers } from '../model/cutlistExport'
import { numberFormat } from '../model/numberFormat'
import { SHEET } from '../model/partSheet'
import type { DrawingLayout } from '../scene/DrawingCanvas'

/**
 * Ritningen som PDF, byggd i webbläsaren i stället för via utskriften: varje
 * blad på en egen A4 i rätt riktning (bladen liggande, kaplistan stående), utan
 * webbläsarens sidhuvud och sidfot och utan att den skalar om något. Bladen står
 * i sin verkliga storlek (SHEET) mitt på sidan, så att skalan stämmer.
 * Laddas först när man trycker på knappen (jsPDF och svg2pdf är stora).
 */

const num = numberFormat(1, true)
const volume = numberFormat(4, true)
const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('sv') + s.slice(1)

/** En bild i pixlar (bara förhållandet mellan bredd och höjd räknas) och som data-URL. */
export interface PdfPicture {
  url: string
  width: number
  height: number
}

export interface DrawingPdfInput {
  name: string
  date: string
  /** Antal blad; kaplistan är det sista. */
  sheets: number
  /** Yttermåtten som text, "470 × 370 × 538". */
  size: string
  /** Stycklistan: en rad per position. */
  positions: readonly CutListRow[]
  cutList: CutList
  /** Sprängskissen, med ballongerna i samma pixlar som bilden. */
  exploded?: PdfPicture & { layout: DrawingLayout | null }
  assembled?: PdfPicture
  /** Bladen som redan är SVG i millimeter (huvudvyer och detaljblad), i ordning. */
  svgSheets: readonly ReactElement[]
}

/** Liggande A4 och bladet mitt på. */
const PAGE = { w: 297, h: 210 }
const OX = (PAGE.w - SHEET.width) / 2
const OY = (PAGE.h - SHEET.height) / 2
/** jsPDF tar textens storlek i punkter; här anges den i mm. */
const PT = 72 / 25.4

export async function buildDrawingPdf(input: DrawingPdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true })
  doc.setProperties({ title: `${input.name} – ritning` })
  drawAssembly(doc, input)
  for (const sheet of input.svgSheets) {
    doc.addPage('a4', 'landscape')
    await drawSvg(doc, sheet)
  }
  drawCutList(doc, input)
  return doc.output('blob')
}

/** Text i mm; färgen som gråskala (0 svart). */
function text(
  doc: jsPDF,
  s: string,
  x: number,
  y: number,
  size: number,
  opts: { bold?: boolean; gray?: number; align?: 'left' | 'right' | 'center'; baseline?: 'alphabetic' | 'middle' } = {},
) {
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
  doc.setFontSize(size * PT)
  doc.setTextColor(opts.gray ?? 0)
  doc.text(s, x, y, { align: opts.align ?? 'left', baseline: opts.baseline ?? 'alphabetic' })
}

/** Kortar texten med … tills den ryms i bredden (i den storlek och vikt som är vald). */
function fitText(doc: jsPDF, s: string, width: number): string {
  if (doc.getTextWidth(s) <= width) return s
  let t = s
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > width) t = t.slice(0, -1)
  return `${t}…`
}

function line(doc: jsPDF, x1: number, y1: number, x2: number, y2: number, width: number, gray = 0) {
  doc.setLineWidth(width)
  doc.setDrawColor(gray)
  doc.line(x1, y1, x2, y2)
}

/** Bilden så stor som ryms i rutan, mitt i; ger skalan (mm per pixel) och var bilden hamnade. */
function contain(pic: PdfPicture, x: number, y: number, w: number, h: number) {
  const k = Math.min(w / pic.width, h / pic.height)
  return { k, x: x + (w - pic.width * k) / 2, y: y + (h - pic.height * k) / 2, w: pic.width * k, h: pic.height * k }
}

/** En ruta i titelrutan: liten rubrik och värdet under. */
function cell(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  size = 3.2,
  bold = false,
) {
  doc.setLineWidth(0.35)
  doc.setDrawColor(0)
  doc.rect(x, y, w, h)
  text(doc, label.toLocaleUpperCase('sv'), x + 1.2, y + 2.9, 2.1, { gray: 51 })
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size * PT)
  text(doc, fitText(doc, value, w - 2.4), x + 1.2, y + h - 1.8, size, { bold })
}

/**
 * Blad 1, sammanställningen: sprängskissen med positionsnummer till vänster; till höger
 * modellen hopsatt, stycklistan och titelrutan. Som bladet på skärmen, i SHEET:s mått.
 */
function drawAssembly(doc: jsPDF, input: DrawingPdfInput) {
  const f = SHEET.frame
  const fx = OX + f
  const fy = OY + f
  const fw = SHEET.width - 2 * f
  const fh = SHEET.height - 2 * f
  const rw = fw * 0.38
  const rx = fx + fw - rw
  doc.setLineWidth(0.7)
  doc.setDrawColor(0)
  doc.rect(fx, fy, fw, fh)
  line(doc, rx, fy, rx, fy + fh, 0.35)

  // Sprängskissen med ballongerna.
  text(doc, 'SPRÄNGSKISS, EJ SKALENLIG', fx + 2.5, fy + 4.5, 2.1, { gray: 68 })
  if (input.exploded) {
    const p = contain(input.exploded, fx + 2, fy + 7, rx - fx - 4, fh - 9)
    doc.addImage(input.exploded.url, 'PNG', p.x, p.y, p.w, p.h, undefined, 'FAST')
    if (input.exploded.layout) drawBalloons(doc, input.exploded.layout, p)
  }

  // Titelrutan längst ner till höger.
  const th = [11, 8.5, 8.5]
  const ty = fy + fh - th[0]! - th[1]! - th[2]!
  const cw = rw / 3
  cell(doc, rx, ty, rw, th[0]!, 'Benämning', input.name, 4.2, true)
  cell(doc, rx, ty + th[0]!, 2 * cw, th[1]!, 'Innehåll', 'Sammanställning, sprängskiss')
  cell(doc, rx + 2 * cw, ty + th[0]!, cw, th[1]!, 'Datum', input.date)
  const y3 = ty + th[0]! + th[1]!
  cell(doc, rx, y3, cw, th[2]!, 'Yttermått B × D × H', input.size, 2.9)
  cell(doc, rx + cw, y3, cw, th[2]!, 'Antal delar', String(input.cutList.totalCount))
  cell(doc, rx + 2 * cw, y3, cw, th[2]!, 'Blad', `1 (${input.sheets})`)

  // Stycklistan ovanför titelrutan. Med många positioner blir raderna lägre, så att
  // modellen hopsatt behåller minst 20 mm.
  const rows = input.positions
  const fixed = 6 + 5 + 5
  const rowH = Math.min(5, (ty - fy - 20 - fixed) / Math.max(1, rows.length))
  const size = Math.min(2.8, rowH * 0.62)
  const listTop = ty - fixed - rows.length * rowH
  line(doc, rx, listTop, rx + rw, listTop, 0.35)
  text(doc, 'Stycklista', rx + 1.5, listTop + 4.2, 3, { bold: true })
  const cols = {
    pos: rx + 7,
    ant: rx + 14,
    name: rx + 16,
    l: rx + rw - 30,
    b: rx + rw - 22,
    t: rx + rw - 15.5,
    mat: rx + rw - 14,
  }
  const headY = listTop + 6
  line(doc, rx, headY, rx + rw, headY, 0.2, 110)
  const head = (s: string, x: number, align: 'left' | 'right') =>
    text(doc, s, x, headY + 3.4, 2.1, { gray: 51, bold: true, align })
  head('POS', cols.pos, 'right')
  head('ANT', cols.ant, 'right')
  head('BENÄMNING', cols.name, 'left')
  head('L', cols.l, 'right')
  head('B', cols.b, 'right')
  head('T', cols.t, 'right')
  head('MATERIAL', cols.mat, 'left')
  let y = headY + 5
  line(doc, rx, y, rx + rw, y, 0.2, 110)
  rows.forEach((row, i) => {
    const base = y + rowH * 0.68
    text(doc, String(i + 1), cols.pos, base, size, { bold: true, align: 'right' })
    text(doc, String(row.count), cols.ant, base, size, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(size * PT)
    const name = compactNames(row.names) + (row.round ? ` (Ø ${num.format(row.round.diameter)})` : '')
    text(doc, fitText(doc, name, cols.l - 9 - cols.name), cols.name, base, size)
    text(doc, num.format(row.length), cols.l, base, size, { align: 'right' })
    text(doc, num.format(row.width), cols.b, base, size, { align: 'right' })
    text(doc, num.format(row.thickness), cols.t, base, size, { align: 'right' })
    text(doc, capitalize(row.material), cols.mat, base, size)
    y += rowH
    line(doc, rx, y, rx + rw, y, 0.15, 190)
  })
  text(doc, 'Mått i mm. L längs fibern, T tjocklek.', rx + 1.5, y + 3.4, 2.3, { gray: 51 })

  // Modellen hopsatt överst.
  text(doc, 'HOPSATT', rx + 2.5, fy + 4.5, 2.1, { gray: 68 })
  if (input.assembled) {
    const p = contain(input.assembled, rx + 2, fy + 6, rw - 4, listTop - fy - 7)
    doc.addImage(input.assembled.url, 'PNG', p.x, p.y, p.w, p.h, undefined, 'FAST')
  }
}

/** Positionsnumren i ringar, med linje och prick till delen; layout i bildens pixlar, som på skärmen. */
function drawBalloons(doc: jsPDF, layout: DrawingLayout, p: { k: number; x: number; y: number }) {
  const px = (v: number) => v * p.k
  const r = px(layout.r)
  for (const b of layout.balloons) {
    const [x, y, bx, by] = [p.x + px(b.x), p.y + px(b.y), p.x + px(b.bx), p.y + px(b.by)]
    const d = Math.hypot(x - bx, y - by) || 1
    line(doc, bx + ((x - bx) / d) * r, by + ((y - by) / d) * r, x, y, Math.max(0.15, r * 0.07))
    doc.setFillColor(0, 0, 0)
    doc.circle(x, y, Math.max(0.35, r * 0.16), 'F')
    doc.setFillColor(255, 255, 255)
    doc.setLineWidth(Math.max(0.2, r * 0.09))
    doc.circle(bx, by, r, 'FD')
    text(doc, String(b.pos), bx, by, r * 1.05, { bold: true, align: 'center', baseline: 'middle' })
  }
}

/** Ett blad som redan är SVG i mm (viewBox = SHEET), i verklig storlek mitt på sidan. */
async function drawSvg(doc: jsPDF, sheet: ReactElement) {
  // svg2pdf läser ett riktigt element; det ritas utanför skärmen och tas bort efteråt.
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:700px;pointer-events:none'
  host.innerHTML = renderToStaticMarkup(sheet)
  document.body.appendChild(host)
  try {
    const svg = host.querySelector('svg')
    if (!svg) return
    // På skärmen ärver bladet appens typsnitt; svg2pdf tar annars Times. PDF:ens
    // Helvetica har bara normal och fet, så 500 blir normal och 600 fet.
    svg.setAttribute('font-family', 'helvetica')
    svg.querySelectorAll('[font-weight]').forEach((el) => {
      el.setAttribute('font-weight', Number(el.getAttribute('font-weight')) >= 600 ? 'bold' : 'normal')
    })
    // Laddas här: svg2pdf behöver en webbläsare (och laddas inte i testerna, som saknar SVG-blad).
    const { svg2pdf } = await import('svg2pdf.js')
    await svg2pdf(svg, doc, { x: OX, y: OY, width: SHEET.width, height: SHEET.height })
  } finally {
    host.remove()
  }
}

/**
 * Kaplistan på stående A4, en eller flera sidor: ämnen att kapa per material, med en
 * ruta att bocka av vid sågen. Ett material börjar på ny sida om det inte ryms men
 * skulle rymmas på en tom; fortsätter det ändå på nästa upprepas rubrikerna.
 */
function drawCutList(doc: jsPDF, input: DrawingPdfInput) {
  const W = 210
  const H = 297
  // 12 mm till kanten: skrivare når inte närmare än 4–5 mm, och det ska se luftigt ut.
  const mx = 12
  const top = 12
  const bottom = H - 12
  const cw = W - 2 * mx
  const col = {
    box: mx,
    ant: mx + 15,
    name: mx + 18,
    l: mx + cw - 46,
    b: mx + cw - 32,
    t: mx + cw - 21,
    pos: mx + cw - 17,
  }
  const nameW = col.l - 14 - col.name
  const posList = (row: CutListRow) => {
    const posOf = new Map(input.positions.flatMap((r, i) => r.bodyIds.map((id) => [id, i + 1] as const)))
    return compactNumbers(row.bodyIds.flatMap((id) => posOf.get(id) ?? []))
  }

  doc.addPage('a4', 'portrait')
  let y = top
  text(doc, 'KAPLISTA', mx, y + 3, 2.6, { bold: true, gray: 51 })
  text(doc, input.name, mx, y + 10.5, 7, { bold: true })
  text(doc, input.date, mx + cw, y + 5, 3.2, { align: 'right', gray: 34 })
  text(doc, `Blad ${input.sheets} (${input.sheets})`, mx + cw, y + 10, 3.2, { align: 'right', gray: 34 })
  y += 13.5
  line(doc, mx, y, mx + cw, y, 0.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(3.2 * PT)
  const summary = doc.splitTextToSize(
    `${input.cutList.totalCount} delar · ${volume.format(input.cutList.totalVolumeM3)} m³. Mått i mm: L längs fibern, T tjocklek. ` +
      'Delar med samma ämne står på en rad även om hålen skiljer; Pos är positionerna i stycklistan.',
    cw,
  ) as string[]
  y += 5.5
  summary.forEach((s, i) => text(doc, s, mx, y + i * 4.4, 3.2, { gray: 34 }))
  y += summary.length * 4.4 + 2

  // Radens höjd: namnet och positionerna kan ta flera rader.
  const rowLines = (row: CutListRow) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(3.6 * PT)
    const name = compactNames(row.names) + (row.round ? ` (Ø ${num.format(row.round.diameter)})` : '')
    const names = doc.splitTextToSize(name, nameW) as string[]
    doc.setFontSize(3.4 * PT)
    const pos = doc.splitTextToSize(posList(row), mx + cw - col.pos) as string[]
    return { names, pos, h: Math.max(names.length, pos.length) * 4.6 + 4.4 }
  }
  const captionH = 10
  const headH = 7

  const caption = (material: string, right: string) => {
    text(doc, material, mx, y + 6.5, 4.4, { bold: true })
    text(doc, right, mx + cw, y + 6.5, 3.2, { align: 'right', gray: 34 })
    y += captionH
    line(doc, mx, y, mx + cw, y, 0.4)
  }
  const header = () => {
    const h = (s: string, x: number, align: 'left' | 'right') =>
      text(doc, s, x, y + 4.6, 2.6, { bold: true, gray: 51, align })
    h('ANT', col.ant, 'right')
    h('BENÄMNING', col.name, 'left')
    h('L', col.l, 'right')
    h('B', col.b, 'right')
    h('T', col.t, 'right')
    h('POS', col.pos, 'left')
    y += headH
    line(doc, mx, y, mx + cw, y, 0.2, 110)
  }
  const newPage = () => {
    doc.addPage('a4', 'portrait')
    y = top
  }

  for (const g of groupByMaterial(input.cutList.rows)) {
    const rows = g.rows.map((row) => ({ row, ...rowLines(row) }))
    const groupH = 6 + captionH + headH + rows.reduce((s, r) => s + r.h, 0)
    const fresh = bottom - top
    if (y + groupH > bottom && groupH <= fresh) newPage()
    else if (y + 6 + captionH + headH + (rows[0]?.h ?? 0) > bottom) newPage()
    else y += 6
    const title = capitalize(g.material)
    caption(title, `${g.count} st · ${volume.format(g.volumeM3)} m³`)
    header()
    for (const r of rows) {
      if (y + r.h > bottom) {
        newPage()
        caption(`${title} (forts.)`, '')
        header()
      }
      const base = y + 6.4
      doc.setLineWidth(0.3)
      doc.setDrawColor(0)
      doc.rect(col.box, base - 3.6, 4, 4)
      text(doc, String(r.row.count), col.ant, base, 3.6, { bold: true, align: 'right' })
      r.names.forEach((s, i) => text(doc, s, col.name, base + i * 4.6, 3.6))
      text(doc, num.format(r.row.length), col.l, base, 4, { bold: true, align: 'right' })
      text(doc, num.format(r.row.width), col.b, base, 4, { bold: true, align: 'right' })
      text(doc, num.format(r.row.thickness), col.t, base, 4, { bold: true, align: 'right' })
      r.pos.forEach((s, i) => text(doc, s, col.pos, base + i * 4.6, 3.4, { gray: 34 }))
      y += r.h
      line(doc, mx, y, mx + cw, y, 0.2, 170)
    }
  }
}
