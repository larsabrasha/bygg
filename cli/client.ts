import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type { Catalog } from '../src/model/catalog'
import type {
  MeApiResponse,
  MeResponse,
  ModelMeta,
  PutModelRequest,
  PutModelResponse,
  ServerCatalog,
  ServerModel,
} from '../src/sync/protocol'

/**
 * CLI:ts anslutning till servern. Adress och nyckel läses i den här ordningen:
 * flaggorna --server, miljövariablerna BYGG_SERVER och BYGG_TOKEN, sist filen som
 * `bygg login` skriver (~/.config/bygg/config.json, bara läsbar för ägaren).
 */

export interface Config {
  server?: string
  token?: string
}

export class CliError extends Error {}

export function configFile(env = process.env): string {
  const base = env.XDG_CONFIG_HOME || path.join(homedir(), '.config')
  return path.join(base, 'bygg', 'config.json')
}

export async function readConfig(file = configFile()): Promise<Config> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Config
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new CliError(`Kunde inte läsa ${file}: ${(e as Error).message}`)
  }
}

export async function writeConfig(config: Config, file = configFile()) {
  if (!config.server && !config.token) {
    await rm(file, { force: true })
    return
  }
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(file, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
  await chmod(file, 0o600)
}

/** Adressen utan / på slutet. Bara http(s); http bara mot den egna datorn. */
export function normalizeServer(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    throw new CliError(`Ogiltig adress: ${raw}`)
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    throw new CliError('Servern ska nås med https (http bara mot localhost), annars skickas nyckeln okrypterad')
  return url.origin
}

export interface Api {
  server: string
  me(): Promise<MeApiResponse>
  authMe(): Promise<MeResponse | null>
  list(): Promise<ModelMeta[]>
  get(id: string): Promise<ServerModel | null>
  put(
    id: string,
    req: PutModelRequest,
  ): Promise<{ ok: true; res: PutModelResponse } | { ok: false; current: ServerModel | null }>
  delete(id: string, baseRevision: number): Promise<{ ok: true } | { ok: false; current: ServerModel | null }>
  catalog(): Promise<Catalog | null>
  logout(): Promise<void>
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>

export function httpClient(server: string, token: string | undefined, fetchFn: FetchFn = fetch): Api {
  const request = async (method: string, p: string, body?: unknown) => {
    let res: Response
    try {
      res = await fetchFn(`${server}${p}`, {
        method,
        headers: {
          ...(token && { authorization: `Bearer ${token}` }),
          ...(body !== undefined && { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        // En omdirigering (till inloggningen) ska inte följas med nyckeln.
        redirect: 'manual',
      })
    } catch (e) {
      throw new CliError(`Ingen kontakt med ${server}: ${(e as Error).message}`)
    }
    if (res.status === 204) return { status: 204, data: null as unknown }
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('application/json'))
      throw new CliError(`${server} svarar inte som en Bygg-server (${res.status})`)
    const data = (await res.json()) as unknown
    const error = (data as { error?: string } | null)?.error
    if (res.status === 401)
      throw new CliError(`${error ?? 'Inte inloggad'}. Kör bygg login${token ? '' : ' (ingen nyckel är sparad)'}.`)
    if (res.status === 429) throw new CliError(error ?? 'För många anrop; vänta en stund')
    if (res.status >= 500) throw new CliError(error ?? `Serverfel ${res.status}`)
    return { status: res.status, data }
  }
  const expect = (r: { status: number; data: unknown }, ...ok: number[]) => {
    if (!ok.includes(r.status)) throw new CliError((r.data as { error?: string })?.error ?? `Fel ${r.status}`)
    return r.data
  }

  return {
    server,
    me: async () => expect(await request('GET', '/api/me'), 200) as MeApiResponse,
    async authMe() {
      const r = await request('GET', '/auth/me').catch((e: unknown) => {
        if (e instanceof CliError && /Inte inloggad|nyckel/.test(e.message)) return null
        throw e
      })
      return r && r.status === 200 ? (r.data as MeResponse) : null
    },
    list: async () => expect(await request('GET', '/api/models'), 200) as ModelMeta[],
    async get(id) {
      const r = await request('GET', `/api/models/${id}`)
      return r.status === 404 ? null : (expect(r, 200) as ServerModel)
    },
    async put(id, req) {
      const r = await request('PUT', `/api/models/${id}`, req)
      if (r.status === 409) return { ok: false, current: (r.data as { current: ServerModel | null }).current }
      return { ok: true, res: expect(r, 200) as PutModelResponse }
    },
    async delete(id, baseRevision) {
      const r = await request('DELETE', `/api/models/${id}?baseRevision=${baseRevision}`)
      if (r.status === 409) return { ok: false, current: (r.data as { current: ServerModel | null }).current }
      expect(r, 204)
      return { ok: true }
    },
    async catalog() {
      const r = await request('GET', '/api/catalog')
      return r.status === 404 ? null : (expect(r, 200) as ServerCatalog).catalog
    },
    async logout() {
      expect(await request('DELETE', '/api/tokens/current'), 204)
    },
  }
}
