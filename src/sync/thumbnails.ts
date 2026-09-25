import { del, get, set } from 'idb-keyval'

/**
 * Bilder av modellerna till startvyn. Tas lokalt när modellen sparas och
 * sparas i IndexedDB bredvid modellen (inte i sparformatet, och synkas inte):
 * en modell som aldrig öppnats på enheten har ingen bild förrän den öppnas.
 */

const PREFIX = 'bygg:thumb:'

type Capturer = () => string | null
let capturer: Capturer | null = null

/** 3D-vyn registrerar hur en bild tas (se scene/ThumbnailCapturer.tsx). */
export function setThumbnailCapturer(fn: Capturer | null) {
  capturer = fn
}

/** Bild av den öppna modellen som data-URL, eller null om det inte går (tom modell, ingen 3D-vy). */
export function captureThumbnail(): string | null {
  try {
    return capturer?.() ?? null
  } catch (e) {
    console.warn('[bygg] Kunde inte ta bild av modellen', e)
    return null
  }
}

export const getThumbnail = (id: string) => get<string>(PREFIX + id)
export const putThumbnail = (id: string, url: string) => set(PREFIX + id, url)
export const deleteThumbnail = (id: string) => del(PREFIX + id)
