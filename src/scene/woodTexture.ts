import { useEffect, useState } from 'react'
import { RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three'
import { UV_MM } from './grainUv'
import { WOOD_SOURCES, woodFile } from './woodSources'

/** Bilderna i src/assets/wood, med Vites adress (med hash, så att en ny bild inte fastnar i cachen). */
const URLS = import.meta.glob<string>('../assets/wood/*.webp', { eager: true, query: '?url', import: 'default' })
const DEFAULT = 'furu'

/** Färgen och normalerna (porerna) för ett träslag. */
export interface Wood {
  map: Texture
  normalMap: Texture
}

interface Entry {
  wood: Wood
  loaded: boolean
  ready: Promise<void>
}
const cache = new Map<string, Entry>()
const loader = new TextureLoader()

/** Trätexturerna för ett material: foton (se woodSources), en uppsättning per material och delad av alla delar av det. */
function entry(material: string): Entry {
  const key = WOOD_SOURCES[material] ? material : DEFAULT
  const hit = cache.get(key)
  if (hit) return hit
  const src = WOOD_SOURCES[key]!
  const load = (kind: 'color' | 'normal') =>
    new Promise<Texture>((resolve) => {
      const texture = loader.load(URLS[`../assets/wood/${woodFile(key, kind)}`]!, resolve)
      texture.wrapS = RepeatWrapping
      texture.wrapT = RepeatWrapping
      texture.anisotropy = 8
      // grainUv ger koordinater i UV_MM; bilden är src.mm stor i verkligheten.
      texture.repeat.set(UV_MM / src.mm, UV_MM / src.mm)
      // Färgen är i sRGB; normalerna är riktningar och ska läsas som de är.
      if (kind === 'color') texture.colorSpace = SRGBColorSpace
    })
  const e: Entry = { wood: null!, loaded: false, ready: null! }
  e.ready = Promise.all([load('color'), load('normal')]).then(([map, normalMap]) => {
    e.wood = { map, normalMap }
    e.loaded = true
  })
  cache.set(key, e)
  return e
}

/**
 * Texturerna när båda laddats, annars null (då ritas delen i sin färg under tiden).
 * Laddas först när de behövs, alltså när man väljer det realistiska utseendet.
 */
export function useWoodTexture(material: string, enabled: boolean): Wood | null {
  const e = enabled ? entry(material) : null
  const [, setLoaded] = useState<Wood | null>(null)
  useEffect(() => {
    if (!e || e.loaded) return
    let live = true
    void e.ready.then(() => live && setLoaded(e.wood))
    return () => {
      live = false
    }
  }, [e])
  return e?.loaded ? e.wood : null
}
