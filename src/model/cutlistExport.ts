import type { CutList } from './cutlist'

/** Utan tusentalsavgränsare: "1200", inte "1 200", så att kalkylprogram läser det som tal. */
const mm = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1, useGrouping: false })

export const formatMm = (n: number) => mm.format(n)

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
      r.names.join(', '),
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
