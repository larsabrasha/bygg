import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { User } from './auth'

/**
 * Nycklar för CLI:t (cli/), så att ett program kan använda API:t utan webbläsarens
 * session-cookie. Man skapar en nyckel inloggad i webbläsaren (/auth/cli) och klistrar
 * in den i `bygg login`. Nyckeln visas en gång; servern sparar bara dess SHA-256.
 *
 * En nyckel ger samma åtkomst som användaren har till /api, inget mer: den kan inte
 * skapa nya nycklar. Den gäller i TOKEN_DAYS och förlängs inte.
 *
 * Alla nycklar ligger i <dataDir>/tokens.json.
 */

export const TOKEN_DAYS = 90
/** Så många nycklar kan en användare ha. En ny tar bort den äldsta. */
export const MAX_TOKENS_PER_USER = 10

export interface TokenInfo {
  id: string
  sub: string
  /** Användarens namn när nyckeln skapades. */
  userName: string
  /** Vad nyckeln är till, t.ex. datorns namn. */
  label: string
  createdAt: string
  expiresAt: string
}

interface StoredToken extends TokenInfo {
  /** SHA-256 av hemligheten, hex. */
  hash: string
}

/** bygg_<id>_<hemlighet>: id för att hitta nyckeln, hemligheten för att visa att man har den. */
const TOKEN_PATTERN = /^bygg_([0-9a-f]{16})_([A-Za-z0-9_-]{43})$/

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export class TokenStore {
  private readonly file: string
  private cache: Promise<StoredToken[]> | null = null
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly dataDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.file = path.join(dataDir, 'tokens.json')
  }

  private load(): Promise<StoredToken[]> {
    return (this.cache ??= readFile(this.file, 'utf8').then(
      (raw) => (JSON.parse(raw) as { tokens: StoredToken[] }).tokens,
      (e: unknown) => {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
        this.cache = null
        throw e
      },
    ))
  }

  /** Kör fn en i taget och sparar listan den returnerar. */
  private update<T>(fn: (tokens: StoredToken[]) => { tokens: StoredToken[]; result: T }): Promise<T> {
    const run = async () => {
      const { tokens, result } = fn(await this.load())
      await mkdir(this.dataDir, { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      await writeFile(tmp, JSON.stringify({ tokens }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
      await rename(tmp, this.file)
      this.cache = Promise.resolve(tokens)
      return result
    }
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => {})
    return next
  }

  private live = (t: StoredToken) => Date.parse(t.expiresAt) > this.now().getTime()

  /** Ny nyckel åt user. Returnerar nyckeln i klartext; den går inte att få fram igen. */
  create(user: User, label: string): Promise<{ token: string; info: TokenInfo }> {
    const id = randomBytes(8).toString('hex')
    const secret = randomBytes(32).toString('base64url')
    const created = this.now()
    const info: TokenInfo = {
      id,
      sub: user.sub,
      userName: user.name,
      label: label.trim().slice(0, 100) || 'CLI',
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + TOKEN_DAYS * 86_400_000).toISOString(),
    }
    return this.update((all) => {
      const kept = all.filter(this.live)
      const mine = kept.filter((t) => t.sub === user.sub)
      // Den äldsta går först, så att man aldrig står utan möjlighet att skapa en ny.
      const drop = new Set(mine.slice(0, Math.max(0, mine.length - MAX_TOKENS_PER_USER + 1)).map((t) => t.id))
      return {
        tokens: [...kept.filter((t) => !drop.has(t.id)), { ...info, hash: sha256(secret) }],
        result: { token: `bygg_${id}_${secret}`, info },
      }
    })
  }

  /** Nyckelns ägare, eller null om nyckeln inte finns, är fel eller har gått ut. */
  async verify(token: string): Promise<(User & { tokenId: string }) | null> {
    const m = TOKEN_PATTERN.exec(token)
    if (!m) return null
    const t = (await this.load()).find((x) => x.id === m[1])
    if (!t || !this.live(t)) return null
    const a = Buffer.from(sha256(m[2]!), 'hex')
    const b = Buffer.from(t.hash, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    return { sub: t.sub, name: t.userName, tokenId: t.id }
  }

  async list(sub: string): Promise<TokenInfo[]> {
    return (await this.load())
      .filter((t) => t.sub === sub && this.live(t))
      .map(({ hash: _hash, ...info }) => {
        void _hash
        return info
      })
  }

  /** Tar bort en av användarens nycklar. Falskt om den inte fanns. */
  revoke(sub: string, id: string): Promise<boolean> {
    return this.update((all) => {
      const kept = all.filter((t) => !(t.sub === sub && t.id === id))
      return { tokens: kept, result: kept.length !== all.length }
    })
  }
}

/**
 * Hur många anrop en nyckel får göra: per minut (alla anrop) och per dygn (ändringar).
 * Så att ett program som går i loop inte kan fylla disken eller låsa servern.
 * Webbläsaren (session-cookie) räknas inte; den sparar själv sällan.
 */
export const RATE = { perMinute: 120, writesPerDay: 1000 } as const

export class RateLimiter {
  private readonly minute = new Map<string, { start: number; count: number }>()
  private readonly day = new Map<string, { start: number; count: number }>()

  constructor(private readonly now: () => number = Date.now) {}

  private hit(map: Map<string, { start: number; count: number }>, key: string, windowMs: number, max: number) {
    const t = this.now()
    const w = map.get(key)
    if (!w || t - w.start >= windowMs) {
      map.set(key, { start: t, count: 1 })
      return 0
    }
    if (w.count >= max) return Math.ceil((w.start + windowMs - t) / 1000)
    w.count++
    return 0
  }

  /** 0 om anropet får göras, annars hur många sekunder det dröjer innan det får det. */
  take(key: string, write: boolean): number {
    const wait = this.hit(this.minute, key, 60_000, RATE.perMinute)
    if (wait || !write) return wait
    return this.hit(this.day, key, 86_400_000, RATE.writesPerDay)
  }
}
