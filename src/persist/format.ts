import { axesFromLegacyGrain } from '../model/partAxes'
import type { ModelDocument } from '../model/types'

/** Höj när formatet ändras, och lägg till en konvertering i migrate. */
export const FORMAT_VERSION = 3

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
const isFrame = (x: unknown) => isObj(x) && isVec3(x.origin) && isVec3(x.u) && isVec3(x.v) && isVec3(x.n)
const isAxis = (x: unknown) => x === 'u' || x === 'v' || x === 'n'
const isRect = (x: unknown) => isObj(x) && isNum(x.x0) && isNum(x.y0) && isNum(x.x1) && isNum(x.y1)

/** Grundlig nog formkontroll för att inte krascha på en trasig eller främmande fil. */
function isModelDocument(x: unknown): x is ModelDocument {
  if (!isObj(x)) return false
  const { sketches, defs, instances, params } = x
  return (
    Array.isArray(sketches) &&
    sketches.every((s) => isObj(s) && typeof s.id === 'string' && isFrame(s.frame) && isRect(s.rect)) &&
    Array.isArray(defs) &&
    defs.every(
      (d) =>
        isObj(d) &&
        typeof d.id === 'string' &&
        typeof d.name === 'string' &&
        isRect(d.profile) &&
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
        (i.pos === undefined || (isObj(i.pos) && Object.values(i.pos).every((e) => typeof e === 'string'))),
    ) &&
    Array.isArray(params) &&
    params.every(
      (p) => isObj(p) && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.expr === 'string',
    )
  )
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
  if (!isModelDocument(doc)) return { ok: false, reason: 'Trasigt dokument' }
  return { ok: true, doc }
}
