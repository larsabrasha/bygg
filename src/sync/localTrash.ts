import { TRASH_DAYS } from './protocol'
import { del, get, keys, set } from './localStore'
import type { LocalModel } from './localRepo'

/**
 * Papperskorgen i webbläsaren, för modeller som servern aldrig fått: allt utan konto, och
 * modeller som togs bort innan de hann synkas. Det som servern har hamnar i serverns
 * papperskorg (se server/storage.ts). Samma regel på båda ställena: TRASH_DAYS dagar, sedan
 * raderas modellen för gott.
 */

export interface LocalTrashItem {
  model: LocalModel
  /** När den lades i papperskorgen. */
  deletedAt: string
  /** Bilden från startvyn, som data-URL. */
  thumb?: string
}

const PREFIX = 'bygg:trash:'
const DAY_MS = 24 * 60 * 60 * 1000

/** Sant när modellen har legat i papperskorgen i TRASH_DAYS dagar och ska raderas. */
export function expired(deletedAt: string, now: Date): boolean {
  const t = Date.parse(deletedAt)
  return Number.isNaN(t) || now.getTime() - t >= TRASH_DAYS * DAY_MS
}

/** Hur många dagar som är kvar innan modellen raderas för gott, påbörjade dagar räknade: TRASH_DAYS direkt, 1 den sista. */
export function daysLeft(deletedAt: string, now: Date): number {
  const left = Date.parse(deletedAt) + TRASH_DAYS * DAY_MS - now.getTime()
  return Math.max(0, Math.ceil(left / DAY_MS))
}

/** Det som ligger i papperskorgen. Det som legat där för länge raderas först. */
export async function listLocalTrash(now = new Date()): Promise<LocalTrashItem[]> {
  const ks = (await keys()).filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX))
  const items: LocalTrashItem[] = []
  for (const k of ks) {
    const item = await get<LocalTrashItem>(k)
    if (!item) continue
    if (expired(item.deletedAt, now)) await del(k)
    else items.push(item)
  }
  return items
}

export const getLocalTrash = (id: string) => get<LocalTrashItem>(PREFIX + id)
export const putLocalTrash = (item: LocalTrashItem) => set(PREFIX + item.model.id, item)
export const removeLocalTrash = (id: string) => del(PREFIX + id)
