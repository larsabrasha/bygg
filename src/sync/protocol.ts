import type { Catalog } from '../model/catalog'
import type { LIMITS } from '../model/limits'
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
  /**
   * Filen finns men går inte att läsa (avbruten skrivning, handredigerad säkerhetskopia).
   * Modellen finns alltså kvar: klienten får inte ta bort sin kopia, och inte hämta den.
   */
  broken?: true
}

/** Så länge en borttagen modell ligger i papperskorgen innan den raderas för gott. */
export const TRASH_DAYS = 30

/** En modell i papperskorgen (data/users/<sub>/trash/<id>-<tid>.json). */
export interface TrashItem {
  id: string
  name: string
  /** När den lades i papperskorgen. Den raderas TRASH_DAYS dagar senare. */
  deletedAt: string
}

/** Svar när en modell tagits tillbaka ur papperskorgen: den ligger bland modellerna igen. */
export interface RestoreResponse {
  revision: number
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

/** Svar från /auth/me när ingen är inloggad. login = false: servern har ingen inloggning, bara läget utan konto. */
export interface LoggedOutResponse {
  error: string
  login: boolean
}

/** Svar från /api/me: vem nyckeln eller sessionen gäller, och vad som gäller för kontot. */
export interface MeApiResponse {
  sub: string
  name: string
  via: 'token' | 'session'
  /** Antal modeller på servern. */
  models: number
  limits: typeof LIMITS
  /** Hur många anrop en nyckel får göra (per minut, och ändringar per dygn). */
  rate: { perMinute: number; writesPerDay: number }
}

/** Modell-id är UUID:er. Kontrolleras på servern så att id aldrig kan bli en sökväg. */
export const MODEL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
