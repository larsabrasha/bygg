import { isPanel, SHEET_MATERIALS } from './cutPlan'
import { numberFormat } from './numberFormat'
import { BOARD, panelThicknesses, SHEET } from './swedishStock'

/**
 * Snäpp mot tjocklekar som finns att köpa, under push/pull. Svagare än snäpp
 * mot andra delar: en smal zon runt varje tjocklek, så att måtten mellan dem
 * går att dra fram. Ett mått man skriver snäpper aldrig.
 */

/** En distance där delen får en tjocklek som finns i handeln, och texten som säger det. */
export interface StockTarget {
  distance: number
  thickness: number
  text: string
}

const mm = numberFormat(1)

/** Den största zonen runt en tjocklek, i mm. */
const MAX_ZONE = 2

/** Tjocklekarna för en del i material med bredden width, och vad det är man köper. */
export function stockThicknesses(material: string, width: number): { thicknesses: readonly number[]; source: string } {
  if (SHEET_MATERIALS.includes(material)) return { thicknesses: SHEET.thicknesses, source: capitalize(material) }
  if (isPanel(false, { length: 0, width })) {
    return { thicknesses: panelThicknesses(material), source: `Limfog av ${material}` }
  }
  return { thicknesses: BOARD.thicknesses, source: 'Hyvlat virke' }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Målen för en tjocklek som blir base + distance (en dels sida dras längs
 * tjockleksaxeln), eller |distance| för en skiss (base 0, båda hållen om
 * bothWays). Bara distances från min och uppåt.
 */
export function thicknessTargets(
  material: string,
  width: number,
  {
    base = 0,
    bothWays = false,
    min = -Infinity,
    max = Infinity,
  }: { base?: number; bothWays?: boolean; min?: number; max?: number } = {},
): StockTarget[] {
  const { thicknesses, source } = stockThicknesses(material, width)
  const out: StockTarget[] = []
  for (const thickness of thicknesses) {
    if (thickness > max) continue
    const text = `${source} finns i ${mm.format(thickness)}`
    const distances = bothWays ? [thickness - base, -(thickness - base)] : [thickness - base]
    for (const distance of distances) if (distance >= min && distance !== 0) out.push({ distance, thickness, text })
  }
  return out
}

/**
 * Målet value snäpper till, eller null. Zonen runt en tjocklek är högst zone,
 * högst MAX_ZONE och högst en fjärdedel av avståndet till grannarna, så att
 * halva mellanrummet alltid går att dra fram.
 */
export function snapStock(value: number, targets: readonly StockTarget[], zone: number): StockTarget | null {
  let best: StockTarget | null = null
  for (const t of targets) {
    const gap = Math.min(
      ...targets
        .filter((o) => o !== t && Math.sign(o.distance) === Math.sign(t.distance))
        .map((o) => Math.abs(o.thickness - t.thickness)),
    )
    const tol = Math.min(zone, MAX_ZONE, gap / 4)
    const d = Math.abs(value - t.distance)
    if (d <= tol && (!best || d < Math.abs(value - best.distance))) best = t
  }
  return best
}
