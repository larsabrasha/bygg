import { buildCutList } from './cutlist'
import { numberFormat } from './numberFormat'
import { fitsBin, packGuillotine, type PackItem } from './guillotine'
import type { Body, StockSettings, StockSize } from './types'

/** Material som köps som skivor. Övriga köps som brädor eller limfogsskivor av massivt trä. */
export const SHEET_MATERIALS: readonly string[] = ['plywood']

export const DEFAULT_KERF = 3

/**
 * Det som rensas bort innan delarna läggs ut, i mm. Skivor: runt alla kanter,
 * som sällan är raka från fabrik. Massivt trä: bara ändarna, som ofta har
 * sprickor; sidorna på hyvlat virke är färdiga.
 */
const DEFAULT_TRIM = { sheet: 10, solid: 20 }

export const defaultTrim = (material: string) =>
  SHEET_MATERIALS.includes(material) ? DEFAULT_TRIM.sheet : DEFAULT_TRIM.solid

/** Hyvlat virke säljs i dessa bredder och i längder med 300 mm steg. */
const BOARD_WIDTHS = [45, 70, 95, 120, 145, 170, 195]
const BOARD_LENGTH = 2400
const PANEL_WIDTH = 600
const SHEET: StockSize = { length: 2440, width: 1220 }

/** Köps som skiva (skivmaterial eller limfogsskiva, bredare än någon bräda) eller som bräda. */
export const isPanel = (g: { sheet: boolean; stock: StockSize }) => g.sheet || g.stock.width > BOARD_WIDTHS.at(-1)!

/** "skiva", "skivor", "bräda" eller "brädor". */
export const stockNoun = (panel: boolean, count: number) =>
  panel ? (count === 1 ? 'skiva' : 'skivor') : count === 1 ? 'bräda' : 'brädor'

/** Nyckeln för lagermåttet: material och tjocklek (samma avrundning som kaplistan). */
export const stockKey = (material: string, thickness: number) => `${material}|${thickness}`

const roundUp = (n: number, step: number) => Math.ceil(n / step) * step

/**
 * Lagermåttet när inget är inställt. Skivmaterial: en hel skiva. Massivt trä:
 * en bräda som räcker för den bredaste delen, eller en limfogsskiva om ingen
 * bräda är bred nog; 2400 lång, eller längre om den längsta delen kräver det.
 */
export function defaultStock(material: string, parts: readonly { length: number; width: number }[]): StockSize {
  if (SHEET_MATERIALS.includes(material)) return SHEET
  const longest = Math.max(0, ...parts.map((p) => p.length))
  const widest = Math.max(0, ...parts.map((p) => p.width))
  const length = longest <= BOARD_LENGTH ? BOARD_LENGTH : roundUp(longest, 300)
  const width = BOARD_WIDTHS.find((w) => w >= widest) ?? Math.max(PANEL_WIDTH, roundUp(widest, 100))
  return { length, width }
}

export interface PlacedPiece {
  bodyId: string
  name: string
  /** Läge och yta på skivan, med kapmånen: x och w längs skivans längd, y och h längs dess bredd. */
  x: number
  y: number
  w: number
  h: number
  /** Delens färdiga mått: L längs fibern, B bredden. */
  length: number
  width: number
  /** Liggande tvärs skivans fiber. */
  rotated: boolean
}

export interface CutPlanGroup {
  key: string
  material: string
  thickness: number
  sheet: boolean
  /** Lagermåttet, med trim alltid satt (inställt eller standard). */
  stock: StockSize & { trim: number }
  /** Lagermåttet är inte inställt utan gissat (defaultStock). */
  isDefault: boolean
  /** En lista per skiva eller bräda. */
  boards: PlacedPiece[][]
  /** Delar som inte går in på en hel skiva eller bräda. */
  tooBig: { bodyId: string; name: string; length: number; width: number }[]
  /** Andel av skivornas yta som blir spill, 0–1. */
  waste: number
}

export interface CutPlan {
  groups: CutPlanGroup[]
  kerf: number
  /** Kapmån på längden, i mm: varje del kapas så mycket längre och kapas till sist. */
  lengthAllowance: number
}

interface Piece {
  bodyId: string
  name: string
}

/**
 * Kapschemat: kaplistans delar utlagda på skivor och brädor, en grupp per
 * material och tjocklek. Delens längd (L, längs fibern) ligger längs skivans
 * längd, utom där skivan får vridas.
 */
export function buildCutPlan(bodies: readonly Body[], settings: StockSettings = {}): CutPlan {
  const kerf = settings.kerf ?? DEFAULT_KERF
  const allowance = settings.lengthAllowance ?? 0
  const names = new Map(bodies.map((b) => [b.id, b.name]))
  const byKey = new Map<
    string,
    { material: string; thickness: number; parts: (Piece & { length: number; width: number })[] }
  >()

  for (const row of buildCutList(bodies).rows) {
    if (row.length <= 0 || row.width <= 0) continue
    const key = stockKey(row.material, row.thickness)
    let group = byKey.get(key)
    if (!group) byKey.set(key, (group = { material: row.material, thickness: row.thickness, parts: [] }))
    for (const bodyId of row.bodyIds)
      group.parts.push({ bodyId, name: names.get(bodyId) ?? '', length: row.length, width: row.width })
  }

  const groups: CutPlanGroup[] = []
  for (const [key, { material, thickness, parts }] of byKey) {
    const sheet = SHEET_MATERIALS.includes(material)
    const saved = settings.sizes?.[key]
    const trim = saved?.trim ?? defaultTrim(material)
    // Det som går åt av skivans längd och bredd för delen, utöver delen själv.
    const extraL = allowance + 2 * trim
    const extraW = sheet ? 2 * trim : 0
    const stock = {
      ...(saved ??
        defaultStock(
          material,
          parts.map((p) => ({ length: p.length + extraL, width: p.width + extraW })),
        )),
      trim,
    }
    // Delarna läggs inom det rensade: bara ändarna för massivt trä, alla kanter för skivor.
    const inset = { x: trim, y: sheet ? trim : 0 }
    const bin = { width: stock.length - 2 * inset.x, height: stock.width - 2 * inset.y }
    const rotatable = sheet && stock.rotate === true

    const items: PackItem<Piece & { length: number; width: number }>[] = []
    const tooBig: CutPlanGroup['tooBig'] = []
    for (const p of parts) {
      const item = { width: p.length + allowance, height: p.width, rotatable, data: p }
      if (bin.width > 0 && bin.height > 0 && fitsBin(bin, item)) items.push(item)
      else tooBig.push({ bodyId: p.bodyId, name: p.name, length: p.length, width: p.width })
    }

    const boards = packGuillotine(bin, items, kerf).map((placed) =>
      placed.map((p) => ({
        bodyId: p.data.bodyId,
        name: p.data.name,
        x: p.x + inset.x,
        y: p.y + inset.y,
        w: p.width,
        h: p.height,
        length: p.data.length,
        width: p.data.width,
        rotated: p.rotated,
      })),
    )
    // Spillet räknas mot delarnas färdiga mått: kapmån och rensade kanter är också spill.
    const used = boards.flat().reduce((sum, p) => sum + p.length * p.width, 0)
    const total = boards.length * stock.length * stock.width
    groups.push({
      key,
      material,
      thickness,
      sheet,
      stock,
      isDefault: !saved,
      boards,
      tooBig,
      waste: total > 0 ? 1 - used / total : 0,
    })
  }

  // Samma ordning som kaplistan: material, sedan tjockast först.
  groups.sort((a, b) => a.material.localeCompare(b.material, 'sv') || b.thickness - a.thickness)
  return { groups, kerf, lengthAllowance: allowance }
}

/** Lika texter en gång, med antal före: "2 × Sarg (900 × 95)". */
export function countSame(texts: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const t of texts) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts].map(([t, n]) => (n > 1 ? `${n} × ${t}` : t))
}

const mm = numberFormat(1, true)
const meters = numberFormat(1, true)

export interface Purchase {
  key: string
  material: string
  /** Antal skivor eller brädor. */
  count: number
  /** "2 brädor ek 22 × 145 × 2400": tjocklek × bredd × längd, som virke märks. */
  text: string
  /** Löpmeter för brädor ("4,8 m"); saknas för skivor. */
  length?: string
}

/** Det som ska köpas: antal skivor och brädor per material, tjocklek och lagermått. */
export function purchaseList(plan: CutPlan): Purchase[] {
  return plan.groups
    .filter((g) => g.boards.length > 0)
    .map((g) => {
      const panel = isPanel(g)
      const count = g.boards.length
      const size = [g.thickness, g.stock.width, g.stock.length].map((n) => mm.format(n)).join(' × ')
      return {
        key: g.key,
        material: g.material,
        count,
        text: `${count} ${stockNoun(panel, count)} ${g.material} ${size}`,
        ...(!panel && { length: `${meters.format((count * g.stock.length) / 1000)} m` }),
      }
    })
}
