import { buildCutList } from './cutlist'
import { numberFormat } from './numberFormat'
import { fitsBin, packGuillotine, type PackItem } from './guillotine'
import { BOARD, PANEL, panelThicknesses, SHEET, standardThickness } from './swedishStock'
import type { Body, StockSettings, StockSize } from './types'

/** Material som köps som skivor. Övriga köps som brädor eller limfogsskivor av massivt trä. */
export const SHEET_MATERIALS: readonly string[] = ['plywood']

export const DEFAULT_KERF = 3

/** En vanlig bräda när inget annat talar för en längd. */
const BOARD_LENGTH = 2400
const SHEET_SIZE: StockSize = { length: SHEET.length, width: SHEET.width }

const MAX_BOARD_WIDTH = BOARD.widths.at(-1)!

/** Köps som skiva (skivmaterial eller limfogsskiva, bredare än någon bräda) eller som bräda. */
export const isPanel = (sheet: boolean, stock: StockSize) => sheet || stock.width > MAX_BOARD_WIDTH

/**
 * Det som rensas bort innan delarna läggs ut, i mm, när inget är inställt.
 * Skivmaterial: 10 runt alla kanter, som ofta är stötta. Brädor: 20 i varje
 * ände, där det ofta finns sprickor; sidorna på hyvlat virke är färdiga.
 * Limfogsskivor: inget, ändarna är raka och hela.
 */
export const defaultTrim = (sheet: boolean, stock: StockSize) => (sheet ? 10 : isPanel(false, stock) ? 0 : 20)

/** "skiva", "skivor", "bräda" eller "brädor". */
export const stockNoun = (panel: boolean, count: number) =>
  panel ? (count === 1 ? 'skiva' : 'skivor') : count === 1 ? 'bräda' : 'brädor'

/** Nyckeln för lagermåtten: material och tjocklek (samma avrundning som kaplistan). */
export const stockKey = (material: string, thickness: number) => `${material}|${thickness}`

const roundUp = (n: number, step: number) => Math.ceil(n / step) * step

/** Det minsta i listan som räcker, annars n avrundat uppåt till step. */
const atLeast = (list: readonly number[], n: number, step: number) => list.find((x) => x >= n) ?? roundUp(n, step)

type Dims = { length: number; width: number }

/**
 * Lagermåtten när inget är inställt, för delarnas färdiga mått. Skivmaterial:
 * en hel skiva. Massivt trä: en bräda för delarna som ryms på en (den smalaste
 * som räcker för den bredaste av dem), och en limfogsskiva i vanligt mått för
 * de bredare. Längden räcker för den längsta delen med kapmån och kapade ändar.
 */
export function defaultStocks(material: string, parts: readonly Dims[], allowance = 0): StockSize[] {
  if (SHEET_MATERIALS.includes(material)) return [SHEET_SIZE]
  const narrow = parts.filter((p) => p.width <= MAX_BOARD_WIDTH)
  const wide = parts.filter((p) => p.width > MAX_BOARD_WIDTH)
  const longest = (list: readonly Dims[]) => Math.max(...list.map((p) => p.length)) + allowance
  const widest = (list: readonly Dims[]) => Math.max(...list.map((p) => p.width))
  const out: StockSize[] = []
  if (narrow.length) {
    const board = { length: 0, width: atLeast(BOARD.widths, widest(narrow), 5) }
    const need = longest(narrow) + 2 * defaultTrim(false, board)
    out.push({ ...board, length: atLeast(BOARD.lengths, need, 300) })
  }
  if (wide.length) {
    const panel = { length: 0, width: atLeast(PANEL.widths, widest(wide), 100) }
    const need = longest(wide) + 2 * defaultTrim(false, panel)
    out.push({ ...panel, length: atLeast(PANEL.lengths, need, 300) })
  }
  return out.length ? out : [{ length: BOARD_LENGTH, width: BOARD.widths[0]! }]
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

/** Ett lagermått i en grupp och delarna som kapas ur det. */
export interface StockLayout {
  /** Lagermåttet, med trim alltid satt (inställt eller standard). */
  stock: StockSize & { trim: number }
  /** Köps som skiva, inte som bräda (isPanel). */
  panel: boolean
  /** Tjockleken man köper: den minsta svenska standardtjockleken som räcker för delarna. */
  thickness: number
  /** En lista per skiva eller bräda. */
  boards: PlacedPiece[][]
}

export interface CutPlanGroup {
  key: string
  material: string
  thickness: number
  /** Skivmaterial: rensas runt om och får vridas om det är inställt. */
  sheet: boolean
  /** Lagermåtten i den ordning de står i inställningen (eller defaultStocks). */
  stocks: StockLayout[]
  /** Lagermåtten är inte inställda utan gissade (defaultStocks). */
  isDefault: boolean
  /** Delar som inte går in på något av lagermåtten, ens på en hel skiva eller bräda. */
  tooBig: { bodyId: string; name: string; length: number; width: number }[]
  /** Andel av skivornas och brädornas yta som blir spill, 0–1. */
  waste: number
  /** Delar får kapas ur spill på ett annat mått (inställningen noLeftover). */
  leftover: boolean
  /**
   * Delarna som kapas ur spill på ett annat mått än det smalaste de ryms på, eller skulle
   * göra det om spill användes; tomt när spill inte gör någon skillnad.
   */
  moved: { bodyId: string; name: string; length: number; width: number; toPanel: boolean; fromPanel: boolean }[]
}

export interface CutPlan {
  groups: CutPlanGroup[]
  kerf: number
  /** Kapmån på längden, i mm: varje del kapas så mycket längre och kapas till sist. */
  lengthAllowance: number
}

interface Part {
  index: number
  bodyId: string
  name: string
  length: number
  width: number
}

/** Delarna läggs inom det rensade: bara ändarna för massivt trä, alla kanter för skivor. */
const insetOf = (sheet: boolean, trim: number) => ({ x: trim, y: sheet ? trim : 0 })

/** Högst så många försök att flytta delar till spill, så att en stor modell inte hänger sig. */
const MAX_MOVES = 200

/**
 * Kapschemat: kaplistans delar utlagda på skivor och brädor, en grupp per
 * material och tjocklek. Delens längd (L, längs fibern) ligger längs skivans
 * längd, utom där skivan får vridas.
 *
 * Har en grupp flera lagermått kapas varje del först ur det smalaste den får
 * plats på (vid lika bredd det kortaste), så att smala delar tas ur brädor och
 * breda ur skivor. Sedan flyttas delarna på en bräda eller skiva, en i taget
 * med den minst fyllda först, till ett annat mått om det minskar ytan som
 * behöver köpas: en sockel kapas hellre ur spillet på en skiva man ändå köper
 * än ur en egen bräda. Ytan, inte priset, eftersom priserna inte är kända.
 * Användaren kan välja bort det per grupp (noLeftover); moved säger vilka delar det gäller.
 */
export function buildCutPlan(bodies: readonly Body[], settings: StockSettings = {}): CutPlan {
  const kerf = settings.kerf ?? DEFAULT_KERF
  const allowance = settings.lengthAllowance ?? 0
  const names = new Map(bodies.map((b) => [b.id, b.name]))
  const byKey = new Map<string, { material: string; thickness: number; parts: Part[] }>()

  for (const row of buildCutList(bodies).rows) {
    if (row.length <= 0 || row.width <= 0) continue
    const key = stockKey(row.material, row.thickness)
    let group = byKey.get(key)
    if (!group) byKey.set(key, (group = { material: row.material, thickness: row.thickness, parts: [] }))
    for (const bodyId of row.bodyIds)
      group.parts.push({
        index: group.parts.length,
        bodyId,
        name: names.get(bodyId) ?? '',
        length: row.length,
        width: row.width,
      })
  }

  const groups: CutPlanGroup[] = []
  for (const [key, { material, thickness, parts }] of byKey) {
    const sheet = SHEET_MATERIALS.includes(material)
    // Bara en lista räknas: ett ensamt mått från förr (kvar i minnet efter hot reload) har också length.
    const list = settings.sizes?.[key]
    const saved = Array.isArray(list) && list.length > 0 ? list : undefined
    const sizes = saved ?? defaultStocks(material, parts, allowance)
    const stocks = sizes.map((s) => ({ ...s, trim: s.trim ?? defaultTrim(sheet, s) }))
    const binOf = (stock: StockSize & { trim: number }) => {
      const inset = insetOf(sheet, stock.trim)
      return { width: stock.length - 2 * inset.x, height: stock.width - 2 * inset.y }
    }
    const bins = stocks.map(binOf)
    const area = stocks.map((s) => s.length * s.width)
    const item = (p: Part, i: number): PackItem<Part> => ({
      width: p.length + allowance,
      height: p.width,
      rotatable: sheet && stocks[i]!.rotate === true,
      data: p,
    })
    const fits = (p: Part, i: number) => {
      const bin = bins[i]!
      return bin.width > 0 && bin.height > 0 && fitsBin(bin, item(p, i))
    }

    // Smalast först, vid lika bredd kortast: det första som delen ryms på vinner.
    const order = stocks
      .map((_, i) => i)
      .sort((a, b) => stocks[a]!.width - stocks[b]!.width || stocks[a]!.length - stocks[b]!.length)
    let assign = parts.map((p) => order.find((i) => fits(p, i)) ?? -1)
    const pack = (i: number, a: readonly number[]) =>
      packGuillotine(
        bins[i]!,
        parts.filter((p) => a[p.index] === i).map((p) => item(p, i)),
        kerf,
      )

    // I ett förslag får brädor och limfogsskivor den standardlängd som ger minst att köpa:
    // fyra ben om 720 ryms på en bräda om 3000 i stället för två om 2400. Vid lika den kortaste.
    if (!saved && !sheet) {
      stocks.forEach((stock, i) => {
        const lengths = isPanel(false, stock) ? PANEL.lengths : BOARD.lengths
        let best = { length: stock.length, cost: pack(i, assign).length * stock.length }
        for (const length of lengths.filter((l) => l > stock.length)) {
          stocks[i] = { ...stock, length }
          bins[i] = binOf(stocks[i]!)
          const cost = pack(i, assign).length * length
          if (cost < best.cost) best = { length, cost }
        }
        stocks[i] = { ...stock, length: best.length }
        bins[i] = binOf(stocks[i]!)
        area[i] = best.length * stock.width
      })
    }
    let packed = stocks.map((_, i) => pack(i, assign))
    const first = { assign, packed }

    // Flytta delarna på en bräda eller skiva till ett annat mått, om det minskar ytan att köpa.
    const fill = (board: readonly { width: number; height: number }[]) =>
      board.reduce((sum, p) => sum + p.width * p.height, 0)
    let moves = 0
    search: while (stocks.length > 1 && moves < MAX_MOVES) {
      for (const i of order) {
        for (const board of [...packed[i]!].sort((a, b) => fill(a) - fill(b))) {
          const ids = board.map((p) => p.data.index)
          for (const j of order) {
            if (j === i || !ids.every((k) => fits(parts[k]!, j))) continue
            if (++moves > MAX_MOVES) break search
            const trial = assign.slice()
            for (const k of ids) trial[k] = j
            const pi = pack(i, trial)
            const pj = pack(j, trial)
            const before = packed[i]!.length * area[i]! + packed[j]!.length * area[j]!
            const after = pi.length * area[i]! + pj.length * area[j]!
            if (after < before) {
              assign = trial
              packed = packed.map((b, n) => (n === i ? pi : n === j ? pj : b))
              continue search
            }
          }
        }
      }
      break
    }
    // Delarna som hamnade i spill. Vill man inte det står utlägget utan flyttar kvar.
    const moved = parts
      .filter((p) => assign[p.index] !== first.assign[p.index])
      .map(({ bodyId, name, length, width, index }) => ({
        bodyId,
        name,
        length,
        width,
        toPanel: isPanel(sheet, stocks[assign[index]!]!),
        fromPanel: isPanel(sheet, stocks[first.assign[index]!]!),
      }))
    const leftover = !settings.noLeftover?.includes(key)
    if (!leftover) ({ assign, packed } = first)

    let used = 0
    let total = 0
    const layouts: StockLayout[] = stocks.map((stock, i) => {
      const inset = insetOf(sheet, stock.trim)
      const boards = packed[i]!.map((placed) =>
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
      used += boards.flat().reduce((sum, p) => sum + p.length * p.width, 0)
      total += boards.length * area[i]!
      const panel = isPanel(sheet, stock)
      const standard = sheet ? SHEET.thicknesses : panel ? panelThicknesses(material) : BOARD.thicknesses
      return { stock, panel, thickness: standardThickness(standard, thickness), boards }
    })

    groups.push({
      key,
      material,
      thickness,
      sheet,
      // Ett förslag som inget kapas ur (sockeln hamnade i spillet) visas inte; inställda mått står kvar.
      stocks:
        saved || layouts.every((l) => l.boards.length === 0) ? layouts : layouts.filter((l) => l.boards.length > 0),
      isDefault: !saved,
      tooBig: parts
        .filter((p) => assign[p.index] === -1)
        .map(({ bodyId, name, length, width }) => ({ bodyId, name, length, width })),
      waste: total > 0 ? 1 - used / total : 0,
      leftover,
      moved,
    })
  }

  // Samma ordning som kaplistan: material, sedan tjockast först.
  groups.sort((a, b) => a.material.localeCompare(b.material, 'sv') || b.thickness - a.thickness)
  return { groups, kerf, lengthAllowance: allowance }
}

/** "1 skiva · 2 brädor": antalet per slag i gruppen, eller "0 brädor" om inget behövs. */
export function groupCount(g: CutPlanGroup): string {
  const count = (panel: boolean) => g.stocks.filter((l) => l.panel === panel).reduce((n, l) => n + l.boards.length, 0)
  const parts = [true, false]
    .map((panel) => ({ panel, n: count(panel) }))
    .filter(({ n }) => n > 0)
    .map(({ panel, n }) => `${n} ${stockNoun(panel, n)}`)
  return parts.length ? parts.join(' · ') : `0 ${stockNoun(g.sheet, 0)}`
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
  /** När man köper tjockare än delarna är ritade (thicknessNote). */
  note?: string
}

/**
 * När man köper tjockare än delarna är ritade. Brädor hyvlas ner. En limfogsskiva
 * hyvlar få hemma, och plywood går inte: där står i stället tjocklekarna som finns,
 * så att man kan rita om delarna.
 */
function thicknessNote(g: CutPlanGroup, l: StockLayout): string {
  const drawn = `delarna ${mm.format(g.thickness)} mm`
  if (!l.panel) return `${drawn}, hyvlas ner`
  // De två närmaste som finns: den tunnare och den man köper.
  const list = g.sheet ? SHEET.thicknesses : panelThicknesses(g.material)
  const thinner = list.filter((t) => t < g.thickness).at(-1)
  const near = [thinner, l.thickness].filter((t) => t !== undefined).map((t) => mm.format(t))
  return `${drawn}; ${g.sheet ? g.material : 'limfog'} finns i ${near.join(' och ')}`
}

/** "22 × 95 × 2 400": tjocklek × bredd × längd, som virke märks i Sverige. */
export const stockDims = (l: StockLayout) =>
  [l.thickness, l.stock.width, l.stock.length].map((n) => mm.format(n)).join(' × ')

/** Det som ska köpas: antal skivor och brädor per material, tjocklek och lagermått. */
export function purchaseList(plan: CutPlan): Purchase[] {
  return plan.groups.flatMap((g) =>
    g.stocks
      .filter((l) => l.boards.length > 0)
      .map((l, i) => {
        const count = l.boards.length
        return {
          key: `${g.key}|${i}`,
          material: g.material,
          count,
          text: `${count} ${stockNoun(l.panel, count)} ${g.material} ${stockDims(l)}`,
          ...(!l.panel && { length: `${meters.format((count * l.stock.length) / 1000)} m` }),
          ...(l.thickness !== g.thickness && { note: thicknessNote(g, l) }),
        }
      }),
  )
}

/**
 * Ett nytt lagermått att lägga till. Finns delar som inte får plats: ett mått
 * som räcker för dem (som standardmåtten, defaultStocks). Annars för massivt
 * trä en bräda om gruppen saknar en, en limfogsskiva om den saknar en, och
 * till sist en kopia av det sista måttet, att ändra. Det som rensas bort blir
 * standard för sitt slag, utom i kopian.
 */
export function nextStock(g: CutPlanGroup, allowance: number): StockSize {
  const [fit] = defaultStocks(g.material, g.tooBig, allowance)
  if (g.tooBig.length > 0 && fit) return fit
  if (!g.sheet && !g.stocks.some((l) => !l.panel)) return { length: BOARD_LENGTH, width: 95 }
  if (!g.sheet && !g.stocks.some((l) => l.panel)) return { length: BOARD_LENGTH, width: 600 }
  return { ...g.stocks.at(-1)!.stock }
}
