import {
  isBuiltInMaterial,
  isKnownMaterial,
  MATERIAL_SPECS,
  materialSpec,
  type MaterialKind,
  type MaterialSpec,
} from './materials'
import type { ModelDocument, Paint } from './types'

/**
 * Användarens material och färger: egna material, inbyggda som inte visas i
 * väljaren och standardfärger. Hör till användaren, inte till en modell, och
 * synkas som en egen fil (se sync/catalogSync). En modell sparar kopior av de
 * egna material den använder (embedMaterials), så att den ser likadan ut för
 * någon annan och när materialet tagits bort ur listan.
 *
 * Varje post har updatedAt. Två enheter som ändrat listan slås ihop post för
 * post, och den senast ändrade vinner (mergeCatalogs).
 */

export interface CatalogMaterial extends MaterialSpec {
  updatedAt: string
}

/** En standardfärg: ett namn ("Monterblå"), färgen som ritas och koden man beställer efter. */
export interface CatalogColor extends Paint {
  id: string
  name: string
  updatedAt: string
}

export interface Catalog {
  materials: CatalogMaterial[]
  colors: CatalogColor[]
  /** Inbyggda material som inte visas i väljaren. De finns kvar för delar som redan har dem. */
  hidden: string[]
  /** När hidden ändrades senast; listan slås ihop som en post. */
  hiddenAt?: string
  /** Borttagna poster (id → när), så att en borttagning vinner över en äldre version från en annan enhet. */
  removed: Record<string, string>
}

export const emptyCatalog = (): Catalog => ({ materials: [], colors: [], hidden: [], removed: {} })

/**
 * Slår ihop två versioner av listan: den senast ändrade av varje post, och
 * en borttagning om den är nyare än posten. Samma svar åt båda hållen.
 */
export function mergeCatalogs(a: Catalog, b: Catalog): Catalog {
  const removed: Record<string, string> = { ...a.removed }
  for (const [id, at] of Object.entries(b.removed)) if (!removed[id] || at > removed[id]) removed[id] = at
  const merge = <T extends { id: string; updatedAt: string }>(x: readonly T[], y: readonly T[]): T[] => {
    const byId = new Map<string, T>()
    for (const item of [...x, ...y]) {
      const other = byId.get(item.id)
      // Vid lika tid vinner den största i JSON, så att svaret inte beror på ordningen.
      if (
        !other ||
        item.updatedAt > other.updatedAt ||
        (item.updatedAt === other.updatedAt && JSON.stringify(item) > JSON.stringify(other))
      )
        byId.set(item.id, item)
    }
    return [...byId.values()].filter((item) => !(removed[item.id] && removed[item.id]! >= item.updatedAt))
  }
  const hiddenFromB = (b.hiddenAt ?? '') > (a.hiddenAt ?? '')
  const hidden = hiddenFromB ? b : a
  return {
    materials: merge(a.materials, b.materials),
    colors: merge(a.colors, b.colors),
    hidden: [...hidden.hidden],
    ...(hidden.hiddenAt && { hiddenAt: hidden.hiddenAt }),
    removed,
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null
const isHex = (x: unknown): x is string => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x)
const isText = (x: unknown, max = 200): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= max
const KINDS: readonly MaterialKind[] = ['wood', 'sheet', 'ordered']
const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 100_000

/** Ett material som ser rimligt ut, annars null. Delas av listan och modellens kopior. */
export function cleanMaterialSpec(x: unknown): MaterialSpec | null {
  if (!isObj(x) || !isText(x.id, 100) || !isText(x.name) || !KINDS.includes(x.kind as MaterialKind) || !isHex(x.color))
    return null
  if (typeof x.grain !== 'boolean') return null
  const thicknesses = Array.isArray(x.thicknesses)
    ? [...new Set(x.thicknesses.filter(positive))].sort((p, q) => p - q)
    : undefined
  const sheets = Array.isArray(x.sheets)
    ? x.sheets.filter(
        (s): s is { length: number; width: number } => isObj(s) && positive(s.length) && positive(s.width),
      )
    : undefined
  const opacity = typeof x.opacity === 'number' && x.opacity > 0 && x.opacity < 1 ? x.opacity : undefined
  return {
    id: x.id,
    name: x.name.trim(),
    kind: x.kind as MaterialKind,
    grain: x.grain,
    color: x.color.toLowerCase(),
    ...(thicknesses?.length && { thicknesses }),
    ...(sheets?.length && { sheets: sheets.map(({ length, width }) => ({ length, width })) }),
    ...(x.hardwood === true && { hardwood: true }),
    ...(opacity && { opacity }),
  }
}

const isStamp = (x: unknown): x is string => typeof x === 'string' && x.length <= 40

/** Listan som den ser ut efter kontroll: det som inte ser rimligt ut släpps, resten läses. */
export function cleanCatalog(x: unknown): Catalog {
  if (!isObj(x)) return emptyCatalog()
  const materials = (Array.isArray(x.materials) ? x.materials : []).flatMap((m): CatalogMaterial[] => {
    const spec = cleanMaterialSpec(m)
    // Ett eget material får inte ta ett inbyggts id.
    if (!spec || isBuiltInMaterial(spec.id) || !isStamp((m as Record<string, unknown>).updatedAt)) return []
    return [{ ...spec, updatedAt: (m as Record<string, unknown>).updatedAt as string }]
  })
  const colors = (Array.isArray(x.colors) ? x.colors : []).flatMap((c): CatalogColor[] => {
    if (!isObj(c) || !isText(c.id, 100) || !isText(c.name) || !isHex(c.color) || !isStamp(c.updatedAt)) return []
    const code = typeof c.code === 'string' && c.code.trim() ? c.code.trim() : undefined
    return [
      { id: c.id, name: c.name.trim(), color: c.color.toLowerCase(), ...(code && { code }), updatedAt: c.updatedAt },
    ]
  })
  const hidden = Array.isArray(x.hidden) ? x.hidden.filter((id): id is string => typeof id === 'string') : []
  const removed = isObj(x.removed)
    ? Object.fromEntries(Object.entries(x.removed).filter((e): e is [string, string] => isStamp(e[1])))
    : {}
  return {
    materials: unique(materials),
    colors: unique(colors),
    hidden: [...new Set(hidden)],
    ...(isStamp(x.hiddenAt) && { hiddenAt: x.hiddenAt }),
    removed,
  }
}

/** Den första av varje id. */
const unique = <T extends { id: string }>(list: readonly T[]) => {
  const seen = new Set<string>()
  return list.filter((x) => !seen.has(x.id) && seen.add(x.id))
}

/** Materialet utan listans egna fält, som det sparas i en modell. */
export function specOf(m: CatalogMaterial): MaterialSpec {
  const spec: MaterialSpec & { updatedAt?: string } = { ...m }
  delete spec.updatedAt
  return spec
}

/**
 * Modellen med kopior av de egna material som delarna använder, som de ser ut
 * nu (materialSpec: användarens lista före modellens egna kopior). Kopior av
 * material som inte används längre tas bort. Samma dokument om inget ändrats.
 */
export function embedMaterials(doc: ModelDocument): ModelDocument {
  const used = [...new Set(doc.defs.map((d) => d.material))].filter((id) => !isBuiltInMaterial(id))
  const own = new Map((doc.materials ?? []).map((m) => [m.id, m]))
  // Okänt i listan och bland de inlästa kopiorna: behåll modellens egen kopia om den finns.
  const materials = used.flatMap((id) => {
    const spec = isKnownMaterial(id) ? materialSpec(id) : own.get(id)
    return spec ? [spec] : []
  })
  const before = JSON.stringify(doc.materials ?? [])
  if (JSON.stringify(materials) === before) return doc
  if (materials.length) return { ...doc, materials }
  const rest = { ...doc }
  delete rest.materials
  return rest
}

const parseNumber = (s: string) => Number(s.replace(',', '.'))

/**
 * Tjocklekar som man skriver dem: "12 16 19", "12; 16; 19" eller "4, 6,5, 9".
 * Ett kommatecken mellan siffror är decimaltecken; följt av mellanslag skiljer det
 * två tal. Tunnast först, utan dubbletter; det som inte är ett tal släpps.
 */
export function parseThicknesses(text: string): number[] {
  const parts = text
    .replace(/,(\s|$)/g, ' ')
    .split(/[\s;]+/)
    .filter(Boolean)
  const nums = parts.map(parseNumber).filter((n) => Number.isFinite(n) && n > 0 && n < 1000)
  return [...new Set(nums)].sort((a, b) => a - b)
}

/** Skivmått som man skriver dem: "2440 × 1220, 2500 × 1250" (× eller x). Längden först. */
export function parseSheets(text: string): { length: number; width: number }[] {
  return text.split(/;|,\s|\n/).flatMap((part) => {
    const m = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i.exec(part)
    if (!m) return []
    const [length, width] = [parseNumber(m[1]!), parseNumber(m[2]!)]
    return length > 0 && width > 0 ? [{ length, width }] : []
  })
}

/** Materialen i väljaren: de inbyggda som inte är dolda, sedan de egna. */
export function pickerMaterials(catalog: Catalog): MaterialSpec[] {
  return [...MATERIAL_SPECS.filter((m) => !catalog.hidden.includes(m.id)), ...catalog.materials.map(specOf)]
}

/**
 * Standardfärgerna som följer med, vanliga kulörer på montrar och väggar. Går att
 * slå av (hidden), som de inbyggda materialen. Skärmfärgerna är räknade ur koden
 * med ncs-color (MIT) en gång, och är ungefärliga: ingen skärm visar en målad yta rätt.
 */
export const BUILT_IN_COLORS: readonly (Paint & { id: string; name: string })[] = [
  { id: 'ncs-0500-n', name: 'Vit', code: 'NCS S 0500-N', color: '#f2f2f2' },
  { id: 'ncs-0502-y', name: 'Bruten vit', code: 'NCS S 0502-Y', color: '#fffdf6' },
  { id: 'ncs-1002-y', name: 'Varmvit', code: 'NCS S 1002-Y', color: '#f1f0e9' },
  { id: 'ncs-1505-y20r', name: 'Beige', code: 'NCS S 1505-Y20R', color: '#e4ddd0' },
  { id: 'ncs-2000-n', name: 'Ljusgrå', code: 'NCS S 2000-N', color: '#cccccc' },
  { id: 'ncs-4500-n', name: 'Grå', code: 'NCS S 4500-N', color: '#8c8c8c' },
  { id: 'ncs-6500-n', name: 'Mörkgrå', code: 'NCS S 6500-N', color: '#595959' },
  { id: 'ncs-8000-n', name: 'Antracit', code: 'NCS S 8000-N', color: '#323232' },
  { id: 'ncs-9000-n', name: 'Svart', code: 'NCS S 9000-N', color: '#191919' },
  { id: 'ncs-7020-b', name: 'Mörkblå', code: 'NCS S 7020-B', color: '#374750' },
  { id: 'ncs-6020-r90b', name: 'Blå', code: 'NCS S 6020-R90B', color: '#44516b' },
  { id: 'ncs-6010-g10y', name: 'Mörkgrön', code: 'NCS S 6010-G10Y', color: '#5c6b5d' },
  { id: 'ncs-5040-y90r', name: 'Oxblod', code: 'NCS S 5040-Y90R', color: '#863732' },
  { id: 'ncs-2030-y20r', name: 'Ockra', code: 'NCS S 2030-Y20R', color: '#d6b979' },
]

export interface PaintChoice {
  paint: Paint
  /** Standardfärgens namn; saknas för en färg som bara finns i modellen. */
  name?: string
}

const samePaint = (a: Paint, b: Paint) => a.color === b.color && (a.code ?? '') === (b.code ?? '')
const cleanPaint = (p: Paint): Paint => ({ color: p.color, ...(p.code && { code: p.code }) })

/** Standardfärgerna att välja bland: de inbyggda som inte är avslagna, sedan de egna. */
export function standardColors(catalog: Catalog): PaintChoice[] {
  return [...BUILT_IN_COLORS.filter((c) => !catalog.hidden.includes(c.id)), ...catalog.colors].map((c) => ({
    paint: cleanPaint(c),
    name: c.name,
  }))
}

/**
 * Färgerna att välja bland under Färg, på två rader: standardfärgerna och de
 * som finns i modellen men inte bland dem. Samma färg (och kod) bara en gång.
 */
export function paintChoices(catalog: Catalog, doc: ModelDocument): { standard: PaintChoice[]; model: PaintChoice[] } {
  const standard = standardColors(catalog)
  const model: PaintChoice[] = []
  for (const d of doc.defs) {
    const p = d.paint
    if (p && ![...standard, ...model].some((c) => samePaint(c.paint, p))) model.push({ paint: cleanPaint(p) })
  }
  return { standard, model }
}

/** Färgen finns bland standardfärgerna. */
export const isSavedPaint = (catalog: Catalog, paint: Paint) =>
  standardColors(catalog).some((c) => samePaint(c.paint, paint))
