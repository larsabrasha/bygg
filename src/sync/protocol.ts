import type { Catalog } from '../model/catalog'
import type { SavedFile } from '../persist/format'

/**
 * Det som skickas mellan klient och server. Delas av båda sidor.
 *
 * Varje modell har ett revisionsnummer som servern räknar upp vid varje sparning.
 * Klienten skickar med revisionen den utgick från (baseRevision); stämmer den inte
 * har någon annan enhet sparat emellan, och servern svarar 409 i stället för att skriva över.
 */

export interface ModelMeta {
  id: string
  name: string
  revision: number
  updatedAt: string
}

/** Så ser en modellfil ut på servern (data/models/<id>.json). */
export interface ServerModel extends ModelMeta {
  file: SavedFile
}

export interface PutModelRequest {
  name: string
  /** Revisionen klienten utgick från, eller null för en ny modell. */
  baseRevision: number | null
  file: SavedFile
}

export interface PutModelResponse {
  revision: number
  updatedAt: string
}

/** Svar vid 409: vad servern har nu (null om modellen har tagits bort). */
export interface ConflictResponse {
  current: ServerModel | null
}

/**
 * Användarens material och färger (data/users/<sub>/catalog.json). Samma
 * revisioner som modellerna; vid 409 slår klienten ihop och försöker igen.
 */
export interface ServerCatalog {
  revision: number
  updatedAt: string
  catalog: Catalog
}

export interface PutCatalogRequest {
  /** Revisionen klienten utgick från, eller null om servern inte har någon lista än. */
  baseRevision: number | null
  catalog: Catalog
}

/** Svar vid 409 för listan: vad servern har nu. */
export interface CatalogConflictResponse {
  current: ServerCatalog | null
}

/** Svar från /auth/me: den inloggade användaren. dev = ingen inloggning (dev-servern). */
export interface MeResponse {
  sub: string
  name: string
  dev: boolean
}

/** Modell-id är UUID:er. Kontrolleras på servern så att id aldrig kan bli en sökväg. */
export const MODEL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
