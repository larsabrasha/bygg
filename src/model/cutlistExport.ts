import type { CutListRow } from './cutlist'
import { numberFormat } from './numberFormat'

/** Utan tusentalsavgränsare: "1200", inte "1 200". */
const mm = numberFormat(1)

export const formatMm = (n: number) => mm.format(n)

/**
 * Namnen på raden, kortare när alla börjar med samma ord:
 * "Sarg fram, Sarg bak" blir "Sarg fram, bak".
 */
export function compactNames(names: readonly string[]): string {
  const first = names[0]?.split(' ')[0]
  const shared = names.length > 1 && names.every((n) => n.startsWith(`${first} `) && n.length > first!.length + 1)
  if (!shared) return names.join(', ')
  return [names[0], ...names.slice(1).map((n) => n.slice(first!.length + 1))].join(', ')
}

/**
 * Positionsnummer som text, med tre eller fler i följd som ett intervall:
 * 1, 2, 3, 4, 7 blir "1–4, 7". Två i följd står som de är ("10, 11").
 */
export function compactNumbers(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length;) {
    let j = i
    while (sorted[j + 1] === sorted[j]! + 1) j++
    if (j - i >= 2) parts.push(`${sorted[i]}–${sorted[j]}`)
    else parts.push(...sorted.slice(i, j + 1).map(String))
    i = j + 1
  }
  return parts.join(', ')
}

/** Namnen på raden; en rund del får sin diameter efter, eftersom L×B×T bara visar ämnet. */
export function rowNames(row: CutListRow): string {
  const names = row.names.join(', ')
  return row.round ? `${names} (rund Ø ${formatMm(row.round.diameter)})` : names
}

/** Namnet utan tecken som Windows, macOS eller iOS inte tillåter i ett filnamn. */
export function safeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
