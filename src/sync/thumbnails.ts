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

/**
 * Laddar upp bilden till servern, så att andra enheter får den utan att öppna
 * modellen. 'missing' om modellen inte finns där än (inte synkad), 'failed' vid
 * nätverksfel eller utan server.
 */
export async function uploadThumbnail(id: string, url: string): Promise<'ok' | 'missing' | 'failed'> {
  try {
    const png = await (await fetch(url)).blob()
    const r = await fetch(`/api/models/${id}/thumb`, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: png,
    })
    return r.status === 204 ? 'ok' : r.status === 404 ? 'missing' : 'failed'
  } catch {
    return 'failed'
  }
}

/** Serverns bild av modellen som data-URL, eller null om den saknas eller inte går att hämta. */
export async function downloadThumbnail(id: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/models/${id}/thumb`)
    if (r.status !== 200 || r.headers.get('content-type') !== 'image/png') return null
    const blob = await r.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
