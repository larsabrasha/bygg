import { del, get, set } from './localStore'
import { FORMAT_VERSION, migrate } from '../persist/format'
import { FACES } from '../model/types'
import type { HistoryEntry, Selection } from '../store/documentStore'

/**
 * Ångra-historiken för varje modell, sparad lokalt i IndexedDB bredvid modellen
 * (som bilderna i thumbnails.ts). Den ligger inte i sparformatet och synkas
 * inte: filen hålls liten, och en annan enhet kan inte ångra det man gjort här.
 * Så går det att ladda om sidan och fortfarande ångra.
 *
 * Historiken hör till en viss sparning av modellen (savedAt). Har modellen
 * ändrats någon annanstans sedan, t.ex. på en annan enhet, stämmer den inte och
 * slängs. Annars skulle ett ångra tyst ta bort den andra enhetens ändring.
 */

const PREFIX = 'bygg:history:'

/** Ett steg med delarna som index i poolen. */
interface PackedEntry {
  sketches: number[]
  defs: number[]
  instances: number[]
  params: number[]
  /** Lagermåtten, om modellen har några. */
  stock?: number
  selection: Selection | null
}

export interface SavedHistory {
  version: number
  /** Sparningen av modellen som historiken hör till (SavedFile.savedAt). */
  savedAt: string
  /**
   * Varje del, skiss och parameter en gång. Stegen i historiken delar det som
   * inte ändrats (storen byter bara ut det som ändras), så ett steg kostar
   * bara det som ändrades i det.
   */
  pool: unknown[]
  past: PackedEntry[]
  future: PackedEntry[]
}

const KEYS = ['sketches', 'defs', 'instances', 'params'] as const

export function packHistory(
  past: readonly HistoryEntry[],
  future: readonly HistoryEntry[],
  savedAt: string,
): SavedHistory {
  const pool: unknown[] = []
  const index = new Map<unknown, number>()
  const ref = (x: unknown) => {
    let i = index.get(x)
    if (i === undefined) {
      i = pool.push(x) - 1
      index.set(x, i)
    }
    return i
  }
  const pack = ({ doc, selection }: HistoryEntry): PackedEntry => ({
    sketches: doc.sketches.map(ref),
    defs: doc.defs.map(ref),
    instances: doc.instances.map(ref),
    params: doc.params.map(ref),
    ...(doc.stock && { stock: ref(doc.stock) }),
    selection,
  })
  return { version: FORMAT_VERSION, savedAt, pool, past: past.map(pack), future: future.map(pack) }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

function selectionOf(x: unknown): Selection | null {
  if (!isObj(x) || typeof x.id !== 'string') return null
  if (x.kind === 'sketch') return { kind: 'sketch', id: x.id }
  if (x.kind !== 'body') return null
  const face = FACES.find((f) => f === x.face)
  return face ? { kind: 'body', id: x.id, face } : { kind: 'body', id: x.id }
}

/**
 * Historiken för modellen som den sparades savedAt, eller null om den saknas,
 * hör till en annan sparning, är från en annan version av formatet eller är trasig.
 */
export function unpackHistory(raw: unknown, savedAt: string): { past: HistoryEntry[]; future: HistoryEntry[] } | null {
  if (!isObj(raw) || raw.version !== FORMAT_VERSION || raw.savedAt !== savedAt) return null
  const { pool, past, future } = raw
  if (!Array.isArray(pool) || !Array.isArray(past) || !Array.isArray(future)) return null
  const unpack = (e: unknown): HistoryEntry | null => {
    if (!isObj(e)) return null
    const isRef = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < pool.length
    const doc: Record<string, unknown> = {}
    for (const key of KEYS) {
      const refs = e[key]
      if (!Array.isArray(refs) || !refs.every(isRef)) return null
      doc[key] = refs.map((i: number) => pool[i])
    }
    if (isRef(e.stock)) doc.stock = pool[e.stock]
    // Samma kontroll som när en modell öppnas, så att en trasig post inte kan krascha appen.
    const r = migrate({ version: FORMAT_VERSION, doc })
    return r.ok ? { doc: r.doc, selection: selectionOf(e.selection) } : null
  }
  const entries = (list: unknown[]) => {
    const out = list.map(unpack)
    return out.every((e) => e !== null) ? (out as HistoryEntry[]) : null
  }
  const p = entries(past)
  const f = entries(future)
  return p && f ? { past: p, future: f } : null
}

export const getHistory = (id: string) => get<SavedHistory>(PREFIX + id)
export const putHistory = (id: string, h: SavedHistory) => set(PREFIX + id, h)
export const deleteHistory = (id: string) => del(PREFIX + id)
