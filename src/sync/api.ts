import { newId } from '../model/id'
import { userHeader } from './localStore'
import type {
  CatalogConflictResponse,
  ConflictResponse,
  ModelMeta,
  PutCatalogRequest,
  PutModelRequest,
  PutModelResponse,
  RestoreResponse,
  ServerCatalog,
  ServerModel,
  TrashItem,
} from './protocol'

/** rejected: servern tog inte emot det som skickades (för stort, för många modeller). */
/**
 * Den här flikens id. Servern skickar med det i ändringarna den sänder ut (se server/events.ts),
 * så att fliken inte synkar i onödan efter sina egna sparningar.
 */
export const CLIENT_ID = newId()

export type ApiErrorKind = 'offline' | 'no-server' | 'server' | 'auth' | 'rejected'

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
  ) {
    super(message)
  }
}

export type PutResult = ({ ok: true } & PutModelResponse) | ({ ok: false } & ConflictResponse)
export type DeleteResult = { ok: true } | ({ ok: false } & ConflictResponse)
export type PutCatalogResult = ({ ok: true } & PutModelResponse) | ({ ok: false } & CatalogConflictResponse)

/** Användarens material och färger (se sync/catalogSync). */
export interface CatalogApi {
  getCatalog(): Promise<ServerCatalog | null>
  putCatalog(req: PutCatalogRequest): Promise<PutCatalogResult>
}

/**
 * Serverns papperskorg (se server/storage.ts). restore: 'full' när kontot redan har så många
 * modeller som det får ha, 'gone' när den inte finns kvar (raderad för gott, eller redan tillbaka).
 */
export interface TrashApi {
  listTrash(): Promise<TrashItem[]>
  restore(id: string): Promise<{ ok: true; revision: number } | { ok: false; reason: 'full' | 'gone'; message: string }>
  purge(id: string): Promise<void>
}

export interface SyncApi {
  list(): Promise<ModelMeta[]>
  get(id: string): Promise<ServerModel | null>
  put(id: string, req: PutModelRequest): Promise<PutResult>
  delete(id: string, baseRevision: number): Promise<DeleteResult>
}

/**
 * API-klient mot servern. Nätverksfel blir ApiError('offline'); saknas servern blir det 'no-server';
 * utloggad (eller inloggad som en annan användare) blir 'auth'.
 */
export function httpApi(
  base = '',
  fetchFn: (url: string, init: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
): SyncApi & CatalogApi & TrashApi {
  const request = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> => {
    let res: Response
    try {
      res = await fetchFn(`${base}${path}`, {
        method,
        headers: {
          ...userHeader(),
          'x-bygg-client': CLIENT_ID,
          ...(body !== undefined && { 'content-type': 'application/json' }),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch {
      throw new ApiError('offline', 'Ingen kontakt med servern')
    }
    if (res.status === 204) return { status: 204, data: null }
    // Utan server (statisk hosting) svarar webbservern ofta med index.html i stället för JSON.
    if (!(res.headers.get('content-type') ?? '').includes('application/json'))
      throw new ApiError('no-server', 'Ingen synkserver')
    const data = await res.json()
    if (res.status === 401) throw new ApiError('auth', (data as { error?: string }).error ?? 'Inte inloggad')
    if (res.status >= 500) throw new ApiError('server', (data as { error?: string }).error ?? `Serverfel ${res.status}`)
    return { status: res.status, data }
  }

  return {
    async list() {
      const r = await request('GET', '/api/models')
      if (r.status === 404) throw new ApiError('no-server', 'Ingen synkserver')
      return r.data as ModelMeta[]
    },
    async get(id) {
      const r = await request('GET', `/api/models/${id}`)
      return r.status === 404 ? null : (r.data as ServerModel)
    },
    async put(id, req) {
      const r = await request('PUT', `/api/models/${id}`, req)
      if (r.status === 409) return { ok: false, ...(r.data as ConflictResponse) }
      if (r.status === 400 || r.status === 403 || r.status === 413)
        throw new ApiError('rejected', (r.data as { error?: string }).error ?? `Fel ${r.status}`)
      if (r.status !== 200) throw new ApiError('server', (r.data as { error?: string }).error ?? `Fel ${r.status}`)
      return { ok: true, ...(r.data as PutModelResponse) }
    },
    async getCatalog() {
      const r = await request('GET', '/api/catalog')
      return r.status === 404 ? null : (r.data as ServerCatalog)
    },
    async putCatalog(req) {
      const r = await request('PUT', '/api/catalog', req)
      if (r.status === 409) return { ok: false, ...(r.data as CatalogConflictResponse) }
      if (r.status !== 200) throw new ApiError('server', (r.data as { error?: string }).error ?? `Fel ${r.status}`)
      return { ok: true, ...(r.data as PutModelResponse) }
    },
    async listTrash() {
      const r = await request('GET', '/api/trash')
      if (r.status !== 200) throw new ApiError('server', `Fel ${r.status}`)
      return r.data as TrashItem[]
    },
    async restore(id) {
      const r = await request('POST', `/api/trash/${id}/restore`)
      const message = (r.data as { error?: string } | null)?.error ?? `Fel ${r.status}`
      if (r.status === 403) return { ok: false, reason: 'full', message }
      if (r.status === 404 || r.status === 409) return { ok: false, reason: 'gone', message }
      if (r.status !== 200) throw new ApiError('server', message)
      return { ok: true, revision: (r.data as RestoreResponse).revision }
    },
    async purge(id) {
      const r = await request('DELETE', `/api/trash/${id}`)
      // Redan borta räknas som klart.
      if (r.status !== 204 && r.status !== 404) throw new ApiError('server', `Fel ${r.status}`)
    },
    async delete(id, baseRevision) {
      const r = await request('DELETE', `/api/models/${id}?baseRevision=${baseRevision}`)
      if (r.status === 409) return { ok: false, ...(r.data as ConflictResponse) }
      if (r.status !== 204) throw new ApiError('server', `Fel ${r.status}`)
      return { ok: true }
    },
  }
}
