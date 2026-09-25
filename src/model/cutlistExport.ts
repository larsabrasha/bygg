import type { CutList, CutListRow } from './cutlist'
import { numberFormat } from './numberFormat'

/** Utan tusentalsavgränsare: "1200", inte "1 200", så att kalkylprogram läser det som tal. */
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

/** Namnen på raden; en rund del får sin diameter efter, eftersom L×B×T bara visar ämnet. */
export function rowNames(row: CutListRow): string {
  const names = row.names.join(', ')
  return row.round ? `${names} (rund Ø ${formatMm(row.round.diameter)})` : names
}

const CSV_HEADER = ['Antal', 'Namn', 'Längd (mm)', 'Bredd (mm)', 'Tjocklek (mm)', 'Material']

function csvField(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/**
 * Kaplistan som CSV för svenska Excel/Numbers: semikolon mellan fält och decimalkomma.
 * Inleds med BOM så att Excel läser å, ä och ö som UTF-8.
 */
export function cutListCsv(list: CutList): string {
  const lines = [
    CSV_HEADER,
    ...list.rows.map((r) => [
      String(r.count),
      rowNames(r),
      formatMm(r.length),
      formatMm(r.width),
      formatMm(r.thickness),
      r.material,
    ]),
  ]
  return '\uFEFF' + lines.map((fields) => fields.map(csvField).join(';')).join('\r\n') + '\r\n'
}

/** Filnamn utan tecken som Windows, macOS eller iOS inte tillåter. */
export function cutListFileName(modelName: string, ext: string): string {
  const safe = modelName
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `${safe ? `${safe} – ` : ''}kaplista.${ext}`
}
