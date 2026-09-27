import { cleanMaterialSpec } from '../model/catalog'
import { groupLegacyJoints } from '../model/combine'
import { newId } from '../model/id'
import { isBuiltInMaterial, type MaterialSpec } from '../model/materials'
import { axesFromLegacyGrain } from '../model/partAxes'
import type { ModelDocument, Paint, PartDef, StockSettings } from '../model/types'

/** Höj när formatet ändras, och lägg till en konvertering i migrate. */
export const FORMAT_VERSION = 8

export interface SavedFile {
  version: number
  savedAt: string
  doc: ModelDocument
}

export function serialize(doc: ModelDocument, now = new Date()): SavedFile {
  return { version: FORMAT_VERSION, savedAt: now.toISOString(), doc }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isVec3 = (x: unknown) => Array.isArray(x) && x.length === 3 && x.every(isNum)
const isOrientation = (x: unknown) => isObj(x) && isVec3(x.u) && isVec3(x.v) && isVec3(x.n)
const isFrame = (x: unknown) => isOrientation(x) && isVec3((x as Record<string, unknown>).origin)
const isAxis = (x: unknown) => x === 'u' || x === 'v' || x === 'n'
const isRect = (x: unknown) => isObj(x) && isNum(x.x0) && isNum(x.y0) && isNum(x.x1) && isNum(x.y1)
const isShape = (x: unknown) => x === undefined || x === 'circle'

/** Grundlig nog formkontroll för att inte krascha på en trasig eller främmande fil. */
function isModelDocument(x: unknown): x is ModelDocument {
  if (!isObj(x)) return false
  const { sketches, defs, instances, params } = x
  return (
    Array.isArray(sketches) &&
    sketches.every(
      (s) =>
        isObj(s) &&
        typeof s.id === 'string' &&
        isFrame(s.frame) &&
        isRect(s.rect) &&
        isShape(s.shape) &&
        (s.on === undefined || typeof s.on === 'string'),
    ) &&
    Array.isArray(defs) &&
    defs.every(
      (d) =>
        isObj(d) &&
        typeof d.id === 'string' &&
        typeof d.name === 'string' &&
        isRect(d.profile) &&
        isShape(d.shape) &&
        isNum(d.z0) &&
        isNum(d.z1) &&
        isAxis(d.grainAxis) &&
        isAxis(d.thicknessAxis) &&
        d.grainAxis !== d.thicknessAxis,
    ) &&
    Array.isArray(instances) &&
    instances.every(
      (i) =>
        isObj(i) &&
        typeof i.id === 'string' &&
        typeof i.defId === 'string' &&
        isFrame(i.frame) &&
        (i.rest === undefined || isOrientation(i.rest)) &&
        (i.pos === undefined || (isObj(i.pos) && Object.values(i.pos).every((e) => typeof e === 'string'))) &&
        (i.combine === undefined ||
          (isObj(i.combine) &&
            (i.combine.op === 'add' || i.combine.op === 'subtract' || i.combine.op === 'joint') &&
            typeof i.combine.host === 'string' &&
            (i.combine.into === undefined || typeof i.combine.into === 'string') &&
            (i.combine.group === undefined || typeof i.combine.group === 'string'))),
    ) &&
    Array.isArray(params) &&
    params.every(
      (p) => isObj(p) && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.expr === 'string',
    )
  )
}

const isStockSize = (x: unknown) =>
  isObj(x) &&
  isNum(x.length) &&
  isNum(x.width) &&
  x.length > 0 &&
  x.width > 0 &&
  (x.rotate === undefined || typeof x.rotate === 'boolean') &&
  (x.trim === undefined || (isNum(x.trim) && x.trim >= 0))

/** Lagermåtten som ser rimliga ut; resten släpps, så att standardvärdena gäller och modellen ändå läses. */
function cleanStock(x: unknown): StockSettings | undefined {
  if (!isObj(x)) return undefined
  const out: StockSettings = {}
  if (isNum(x.kerf) && x.kerf >= 0) out.kerf = x.kerf
  if (isNum(x.lengthAllowance) && x.lengthAllowance >= 0) out.lengthAllowance = x.lengthAllowance
  if (Array.isArray(x.noLeftover)) {
    const keys = x.noLeftover.filter((k): k is string => typeof k === 'string')
    if (keys.length) out.noLeftover = keys
  }
  if (isObj(x.sizes)) {
    // Först sparades ett lagermått per grupp, nu en lista: ett ensamt mått blir en lista med ett.
    const sizes = Object.entries(x.sizes)
      .map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).filter(isStockSize)] as const)
      .filter(([, v]) => v.length > 0)
    if (sizes.length) out.sizes = Object.fromEntries(sizes) as StockSettings['sizes']
  }
  return Object.keys(out).length ? out : undefined
}

/** Färgen om den ser rimlig ut (#rrggbb, koden en text), annars ingen: delen blir omålad. */
function cleanPaint(x: unknown): Paint | undefined {
  if (!isObj(x) || typeof x.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(x.color)) return undefined
  const code = typeof x.code === 'string' && x.code.trim() ? x.code.trim() : undefined
  return { color: x.color.toLowerCase(), ...(code && { code }) }
}

function cleanDefPaint(d: PartDef): PartDef {
  if (d.paint === undefined) return d
  const { paint, ...rest } = d
  const clean = cleanPaint(paint)
  return clean ? { ...rest, paint: clean } : rest
}

/** Modellens kopior av egna material, de som ser rimliga ut. Inga kvar: fältet tas bort. */
function cleanDocMaterials(doc: ModelDocument): ModelDocument {
  if (doc.materials === undefined) return doc
  const { materials, ...rest } = doc
  const clean = Array.isArray(materials)
    ? materials.map(cleanMaterialSpec).filter((m): m is MaterialSpec => m !== null && !isBuiltInMaterial(m.id))
    : []
  return clean.length ? { ...rest, materials: clean } : rest
}

export type LoadResult = { ok: true; doc: ModelDocument } | { ok: false; reason: string }

/**
 * Version 1 → 2: fibern sparades som 'length'/'width' i förhållande till
 * storleksordningen. Nu sparas fiberaxel och tjockleksaxel.
 */
export function upgradeV1Doc(doc: unknown): unknown {
  if (!isObj(doc) || !Array.isArray(doc.defs)) return doc
  return {
    ...doc,
    defs: doc.defs.map((d: unknown) => {
      if (!isObj(d) || 'grainAxis' in d || !isRect(d.profile) || !isNum(d.z0) || !isNum(d.z1)) return d
      const { grain, ...rest } = d
      return { ...rest, ...axesFromLegacyGrain(d as never, grain) }
    }),
  }
}

/** Läser en sparad fil och konverterar äldre versioner till nuvarande format. */
export function migrate(raw: unknown): LoadResult {
  if (!isObj(raw) || !isNum(raw.version)) return { ok: false, reason: 'Okänt format' }
  if (raw.version > FORMAT_VERSION) return { ok: false, reason: `Sparad med nyare version (${raw.version})` }
  // En konvertering per versionssteg, i ordning.
  let doc = raw.doc
  if (raw.version < 2) doc = upgradeV1Doc(doc)
  // 2 → 3: kopior kan ha pos (läge som uttryck). Frivilligt fält, så inget att konvertera.
  // 3 → 4: kopior kan ha rest (viloläge för vinklarna) och stå snett. Frivilligt fält.
  // 4 → 5: skisser och former kan ha shape ('circle'). Frivilligt fält.
  // (Versionen höjs ändå, så att en äldre app inte läser cylindrar som lådor.)
  // 5 → 6: kopior kan ha combine (verktyg som läggs till eller skärs ut), och skisser on
  // (delen de ritades på). Frivilliga fält.
  // 6 → 7: combine kan vara en tapp (op 'joint', into). Äldre appar skulle avvisa den.
  // (7) dokumentet kan ha stock (kapschemats lagermått). Frivilligt och ofarligt att tappa, så
  // versionen höjs inte: en server med äldre kod skulle annars neka att spara.
  // (7) former kan ha paint (färgen delen målas i). Frivilligt och ofarligt att tappa, som stock.
  // 7 → 8: tappar kan ha group (de som hör ihop). Äldre filer får grupper för tappar som
  // uppenbart hör ihop (groupLegacyJoints), en gång, när de läses.
  if (!isModelDocument(doc)) return { ok: false, reason: 'Trasigt dokument' }
  const grouped = raw.version < 8 ? groupLegacyJoints(doc, newId) : doc
  // (7) dokumentet kan ha materials (kopior av egna material). Frivilligt: utan det ritas delarna
  // som okänt trä, men måtten stämmer. En äldre app behåller fältet när den sparar.
  const painted = grouped.defs.some((d) => d.paint !== undefined)
    ? { ...grouped, defs: grouped.defs.map(cleanDefPaint) }
    : grouped
  const withMaterials = cleanDocMaterials(painted)
  if (withMaterials.stock === undefined) return { ok: true, doc: withMaterials }
  const { stock, ...rest } = withMaterials
  const clean = cleanStock(stock)
  return { ok: true, doc: clean ? { ...rest, stock: clean } : rest }
}
