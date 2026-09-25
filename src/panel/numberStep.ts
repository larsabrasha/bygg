import { numberFormat } from '../model/numberFormat'

/** Ett rent tal, som fälten skriver det: valfritt minustecken (- eller −), decimalkomma eller punkt. */
const PLAIN = /^\s*([-−]?)(\d+(?:[.,]\d*)?|[.,]\d+)\s*$/

/** Tre decimaler räcker för steg på 0,1 och tar bort flyttalsfel som 0,30000000000000004. */
const fmt = numberFormat(3)

/** Talet i texten, eller null om den inte är ett rent tal (t.ex. ett uttryck eller tom). */
export function plainNumber(text: string): number | null {
  const m = PLAIN.exec(text)
  if (!m) return null
  return Number(m[2]!.replace(',', '.')) * (m[1] ? -1 : 1)
}

/** Steget för en piltangent: 1, med Shift 10, med Alt 0,1. Nedåt negativt. */
export function arrowStep(e: { key: string; shiftKey: boolean; altKey: boolean }): number | null {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return null
  const size = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
  return e.key === 'ArrowUp' ? size : -size
}

/** Texten efter ett steg, i fältens eget format. Null om texten inte är ett rent tal. */
export function stepText(text: string, step: number): string | null {
  const n = plainNumber(text)
  return n === null ? null : fmt.format(n + step)
}
