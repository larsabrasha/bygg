/**
 * Adressen speglar vyn: startsidan med alla modeller är "/", en öppen modell
 * "/{id}" och dess ritning "/{id}/ritning". Servern och service workern svarar
 * med index.html på alla sökvägar. /intro är startsidan (se main.tsx) och når aldrig
 * appen; modell-id är UUID, så det krockar inte.
 */

export type Route = { screen: 'gallery' } | { screen: 'model'; id: string; drawing: boolean }

const DRAWING = 'ritning'

export function pathFor(screen: 'gallery' | 'model', id: string | null, drawing: boolean): string {
  if (screen !== 'model' || !id) return '/'
  const model = `/${encodeURIComponent(id)}`
  return drawing ? `${model}/${DRAWING}` : model
}

export function parsePath(pathname: string): Route {
  let parts: string[]
  try {
    parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return { screen: 'gallery' }
  }
  const [id, rest, ...more] = parts
  if (!id || more.length > 0 || (rest !== undefined && rest !== DRAWING)) return { screen: 'gallery' }
  return { screen: 'model', id, drawing: rest === DRAWING }
}
