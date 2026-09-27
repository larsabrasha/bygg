/**
 * Hur ett material köps och kapas.
 * wood: massivt trä, som brädor eller limfogsskivor (se swedishStock).
 * sheet: skivor som sågas till på plats, med kapschema.
 * ordered: beställs tillskuret (glas); står i kaplistan men inte i kapschemat.
 */
export type MaterialKind = 'wood' | 'sheet' | 'ordered'

export interface MaterialSpec {
  /** Det som sparas i PartDef.material. Ändras aldrig. */
  id: string
  /** Som det skrivs mitt i en mening: "björkplywood", "MDF". */
  name: string
  kind: MaterialKind
  /**
   * Materialet har fiber: kaplistans L går längs den. Utan fiber (MDF, glas)
   * är L det längre av de två måtten som inte är tjockleken, och delarna får
   * vridas fritt på skivan.
   */
  grain: boolean
  /** Tjocklekarna som finns att köpa, tunnast först. Massivt trä: se BOARD och panelThicknesses. */
  thicknesses?: readonly number[]
  /** Skivornas mått (length längs fibern, om den finns), det vanligaste först. */
  sheets?: readonly { length: number; width: number }[]
  /** Färgen i det skuggade utseendet, i kaplistan och i kapschemat. */
  color: string
  /** Lövträ: limfog finns i andra tjocklekar än av barrträ. */
  hardwood?: boolean
  /** Plywood: skikten syns på kanterna i det realistiska utseendet. */
  plies?: boolean
  /** Genomskinligt: hur mycket som syns av ytan (0–1) i 3D-vyn. */
  opacity?: number
}

/**
 * Materialen som finns. Måtten är de vanligaste hos svenska bygghandlare och
 * skivgrossister (hämtade 2026-09-27); sortimentet skiljer sig mellan butiker,
 * och kapschemats lagermått går att ändra per modell.
 *
 * Källor, utöver dem i swedishStock:
 * - Plywood: Ljungberg Fritzoe, "Produktblad Björkplywood": 1 220 × 2 440 i 6,5–24,
 *   1 250 × 2 500 i 4, 1 525 × 1 525 i 6 och 8.
 * - MDF: Bauhaus och Hornbach, "MDF-skivor"; Beijer och Bygma: 1 220 × 2 440 i 6–25.
 * - Spånskiva: XL-Bygg och Hornbach, "Spånskivor": 1 200 × 2 500 i 12–22.
 * - Board (masonit): Bauhaus och Byggmax, 3 mm i 1 220 × 2 440, också 2,4 och oljehärdad 6.
 * - Akryl: Stocksundet, "Plexiglas akrylplast", och GOP: 3 050 × 2 050 och 2 050 × 1 520, 2–10.
 * - Glas: Glasjour, "Floatglas" och "Lamellglas". Floatglas 3–12, i montrar oftast 6 eller 8.
 *   Laminerat 33.1–66.2 är 6,38–12,76 tjockt, här avrundat till tiondelar som Pilkington gör.
 */
export const MATERIAL_SPECS: readonly MaterialSpec[] = [
  { id: 'furu', name: 'furu', kind: 'wood', grain: true, color: '#e3c28f' },
  { id: 'gran', name: 'gran', kind: 'wood', grain: true, color: '#ead7b0' },
  { id: 'ek', name: 'ek', kind: 'wood', grain: true, color: '#b98b57', hardwood: true },
  { id: 'björk', name: 'björk', kind: 'wood', grain: true, color: '#efdcb8', hardwood: true },
  { id: 'ask', name: 'ask', kind: 'wood', grain: true, color: '#d9c49e', hardwood: true },
  {
    id: 'plywood',
    name: 'plywood',
    kind: 'sheet',
    grain: true,
    thicknesses: [4, 6.5, 9, 12, 15, 18, 21, 24],
    sheets: [
      { length: 2440, width: 1220 },
      { length: 2500, width: 1250 },
      { length: 1525, width: 1525 },
    ],
    color: '#d8b98a',
    plies: true,
  },
  {
    id: 'mdf',
    name: 'MDF',
    kind: 'sheet',
    grain: false,
    thicknesses: [6, 8, 10, 12, 16, 19, 22, 25],
    sheets: [{ length: 2440, width: 1220 }],
    color: '#b89770',
  },
  {
    id: 'spånskiva',
    name: 'spånskiva',
    kind: 'sheet',
    grain: false,
    thicknesses: [12, 16, 19, 22],
    sheets: [{ length: 2500, width: 1200 }],
    color: '#cdb389',
  },
  {
    id: 'masonit',
    name: 'masonit',
    kind: 'sheet',
    grain: false,
    thicknesses: [2.4, 3, 6],
    sheets: [{ length: 2440, width: 1220 }],
    color: '#7a5a3c',
  },
  {
    id: 'akryl',
    name: 'akryl',
    kind: 'sheet',
    grain: false,
    thicknesses: [2, 3, 4, 5, 6, 8, 10],
    // Den mindre först: en monter behöver sällan en hel stor skiva.
    sheets: [
      { length: 2050, width: 1520 },
      { length: 3050, width: 2050 },
    ],
    color: '#eef4f5',
    opacity: 0.3,
  },
  {
    id: 'glas',
    name: 'glas',
    kind: 'ordered',
    grain: false,
    thicknesses: [3, 4, 5, 6, 8, 10, 12],
    color: '#cfe4df',
    opacity: 0.25,
  },
  {
    id: 'laminerat glas',
    name: 'laminerat glas',
    kind: 'ordered',
    grain: false,
    thicknesses: [6.4, 6.8, 8.4, 8.8, 10.4, 10.8, 12.8],
    color: '#cfe4df',
    opacity: 0.25,
  },
]

const BY_ID = new Map(MATERIAL_SPECS.map((m) => [m.id, m]))

/** Ett inbyggt material, inte ett eget (se catalog). */
export const isBuiltInMaterial = (id: string) => BY_ID.has(id)

/**
 * Egna material: användarens lista (se catalog) och kopiorna i den öppna
 * modellen. Sätts av catalogStore, så att allt som slår upp ett material
 * (kaplistan, kapschemat, 3D-vyn) hittar dem utan att få listan som argument.
 * Efter HMR sätter catalogStore dem igen.
 */
let custom: ReadonlyMap<string, MaterialSpec> = new Map()

/** Byter de egna materialen. Det första med ett id vinner: användarens lista före modellens kopior. */
export function setCustomMaterials(specs: readonly MaterialSpec[]) {
  const map = new Map<string, MaterialSpec>()
  for (const m of specs) if (!BY_ID.has(m.id) && !map.has(m.id)) map.set(m.id, m)
  custom = map
}

/** Ett material som inte finns (från en nyare app, eller borttaget) räknas som massivt trä. */
const unknown = (id: string): MaterialSpec => ({ id, name: id, kind: 'wood', grain: true, color: '#c8a878' })

export const materialSpec = (id: string): MaterialSpec => BY_ID.get(id) ?? custom.get(id) ?? unknown(id)

/** Materialet finns, inbyggt eller eget. */
export const isKnownMaterial = (id: string) => BY_ID.has(id) || custom.has(id)

/** Som det skrivs först i en rad eller rubrik: "Björkplywood", "MDF". */
export const materialTitle = (id: string) => firstUpper(materialSpec(id).name)

/** Med stor första bokstav: "färg NCS S 0502-Y" → "Färg NCS S 0502-Y". */
export const firstUpper = (s: string) => s.charAt(0).toLocaleUpperCase('sv') + s.slice(1)

/** Skivor som sågas (plywood, MDF, akryl), inte massivt trä och inte glas. */
export const isSheetMaterial = (id: string) => materialSpec(id).kind === 'sheet'

/** Beställs tillskuret och sågas inte: glas. */
export const isOrdered = (id: string) => materialSpec(id).kind === 'ordered'

const KIND_ORDER: Record<MaterialKind, number> = { wood: 0, sheet: 1, ordered: 2 }

/**
 * Ordningen i kaplistan och kapschemat: massivt trä, skivor, sist det som
 * beställs. Inom varje slag i bokstavsordning.
 */
export const compareMaterials = (a: string, b: string) =>
  KIND_ORDER[materialSpec(a).kind] - KIND_ORDER[materialSpec(b).kind] ||
  materialSpec(a).name.localeCompare(materialSpec(b).name, 'sv')

/** Grupperna i materialväljaren. */
export const MATERIAL_GROUPS: readonly { title: string; kind: MaterialKind }[] = [
  { title: 'Massivt trä', kind: 'wood' },
  { title: 'Skivor', kind: 'sheet' },
  { title: 'Glas', kind: 'ordered' },
]
