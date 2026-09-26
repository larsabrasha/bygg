import type { ModelDocument } from '../model/types'
import { migrate, serialize, type SavedFile } from './format'

/**
 * Modellen som fil, för att flytta den mellan appar eller spara en kopia utanför.
 * Samma sparformat som i webbläsaren och på servern, plus namnet.
 */
export interface ModelFile extends SavedFile {
  app: 'bygg'
  name: string
}

export const MODEL_FILE_SUFFIX = '.bygg.json'

export function modelFileJson(name: string, doc: ModelDocument, now = new Date()): string {
  const file: ModelFile = { app: 'bygg', name, ...serialize(doc, now) }
  return JSON.stringify(file)
}

export type ReadResult = { ok: true; name: string; doc: ModelDocument } | { ok: false; reason: string }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

/**
 * Läser en modellfil. Tar också serverns filer (data/models/<id>.json) och ett
 * sparat dokument utan namn; då blir namnet filens namn (fallbackName).
 */
export function readModelFile(text: string, fallbackName: string): ReadResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'Filen är inte en modellfil' }
  }
  if (!isObj(raw)) return { ok: false, reason: 'Filen är inte en modellfil' }
  // Serverns fil: { id, name, revision, file: SavedFile }.
  const saved = isObj(raw.file) && !('doc' in raw) ? raw.file : raw
  if (!isObj(saved) || !('doc' in saved)) return { ok: false, reason: 'Filen är inte en modellfil' }
  const result = migrate(saved)
  if (!result.ok) return result
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : fallbackName
  return { ok: true, name, doc: result.doc }
}

/** Namnet på modellen ur filens namn: utan .bygg.json eller .json. */
export function nameFromFileName(fileName: string): string {
  return fileName.replace(/(\.bygg)?\.json$/i, '').trim() || 'Importerad modell'
}
