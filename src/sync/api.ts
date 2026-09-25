import type { ConflictResponse, ModelMeta, PutModelRequest, PutModelResponse, ServerModel } from './protocol'

export type ApiErrorKind = 'offline' | 'no-server' | 'server'

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

export interface SyncApi {
  list(): Promise<ModelMeta[]>
  get(id: string): Promise<ServerModel | null>
  put(id: string, req: PutModelRequest): Promise<PutResult>
  delete(id: string, baseRevision: number): Promise<DeleteResult>
}

/** API-klient mot servern. Nätverksfel blir ApiError('offline'); saknas servern blir det 'no-server'. */
export function httpApi(
  base = '',
  fetchFn: (url: string, init: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
): SyncApi {
  const request = async (method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> => {
    let res: Response
    try {
      res = await fetchFn(`${base}${path}`, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : {},
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
      if (r.status !== 200) throw new ApiError('server', (r.data as { error?: string }).error ?? `Fel ${r.status}`)
      return { ok: true, ...(r.data as PutModelResponse) }
    },
    async delete(id, baseRevision) {
      const r = await request('DELETE', `/api/models/${id}?baseRevision=${baseRevision}`)
      if (r.status === 409) return { ok: false, ...(r.data as ConflictResponse) }
      if (r.status !== 204) throw new ApiError('server', `Fel ${r.status}`)
      return { ok: true }
    },
  }
}
