import { Hono, type Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import * as oidc from 'openid-client'
import type { MeResponse } from '../src/sync/protocol'

/**
 * Inloggning via OIDC mot en enda utgivare (Pocket ID). Servern sköter hela flödet
 * (authorization code + PKCE, med klienthemlighet) och ger en signerad session-cookie
 * som JavaScript inte kan läsa. Den räcker i SESSION_DAYS från inloggningen och
 * förlängs inte: tas användaren bort i Pocket ID är hen ute senast då.
 *
 * I dev finns ingen inloggning (devAuth): alla anrop gäller dev-användaren.
 */

export interface User {
  sub: string
  name: string
}

export interface Auth {
  /** Inloggad användare, eller null. */
  user(c: Context): Promise<User | null>
  /** Monteras under /auth: login, callback, logout, me. */
  routes: Hono
  /** Appens origin; ändrande anrop från andra origins avvisas. Null i dev. */
  origin: string | null
}

/** Användar-id blir ett mappnamn; bara tecken som inte kan bli en sökväg. */
export const SUB_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const SESSION_DAYS = 30
const LOGIN_MAX_AGE_S = 10 * 60
const LOGIN_COOKIE = 'bygg-login'

/** Dit man skickas efter inloggningen: bara sökvägar i appen, aldrig en annan sajt. */
export function safeReturn(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  if (value.startsWith('/auth/')) return '/'
  return value
}

export function devAuth(): Auth {
  const user: User = { sub: 'dev', name: 'Dev' }
  const routes = new Hono()
  routes.get('/me', (c) => c.json<MeResponse>({ ...user, dev: true }))
  routes.get('/login', (c) => c.redirect(safeReturn(c.req.query('return'))))
  routes.post('/logout', (c) => c.json({ redirect: '/' }))
  return { user: async () => user, routes, origin: null }
}

export interface OidcOptions {
  /** Appens publika adress, t.ex. https://bygg.larsabrasha.com */
  appUrl: string
  issuer: string
  clientId: string
  clientSecret: string
  /** Nyckeln som signerar cookies. */
  sessionSecret: string
  /** Efter varje lyckad inloggning, innan sessionen ges (här skapas användarens mapp). */
  onLogin?: (user: User) => Promise<unknown>
  now?: () => number
  /** Bara i tester: egen fetch mot en låtsad utgivare, och http tillåtet. */
  testFetch?: oidc.CustomFetch
}

interface Session extends User {
  /** Millisekunder sedan 1970. */
  exp: number
}

interface LoginState {
  state: string
  verifier: string
  returnTo: string
}

const page = (c: Context, status: 400 | 403 | 502, text: string) =>
  c.html(
    `<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
      `<title>Bygg</title><body style="font-family:system-ui;padding:24px"><p>${text}</p>` +
      `<p><a href="/auth/login">Försök igen</a></p></body></html>`,
    status,
  )

export function oidcAuth(opts: OidcOptions): Auth {
  const app = new URL(opts.appUrl)
  const secure = app.protocol === 'https:'
  // __Host-: bara den här värden, bara https, hela sajten. Utan https (tester) går prefixet inte.
  const sessionCookie = secure ? '__Host-bygg-session' : 'bygg-session'
  const now = opts.now ?? Date.now
  const secret = opts.sessionSecret

  // Hämtas första gången någon loggar in, och igen om det misslyckades (Pocket ID nere).
  let config: Promise<oidc.Configuration> | null = null
  const getConfig = () =>
    (config ??= oidc
      // Pocket ID anger inte hur klienten ska visa hemligheten; då gäller standarden, Basic.
      .discovery(new URL(opts.issuer), opts.clientId, undefined, oidc.ClientSecretBasic(opts.clientSecret), {
        ...(opts.testFetch && { [oidc.customFetch]: opts.testFetch, execute: [oidc.allowInsecureRequests] }),
      })
      .catch((e: unknown) => {
        config = null
        throw e
      }))

  async function user(c: Context): Promise<User | null> {
    const raw = await getSignedCookie(c, secret, sessionCookie)
    if (!raw) return null
    try {
      const s = JSON.parse(raw) as Session
      if (typeof s.exp !== 'number' || s.exp < now() || typeof s.sub !== 'string' || !SUB_PATTERN.test(s.sub))
        return null
      return { sub: s.sub, name: String(s.name) }
    } catch {
      return null
    }
  }

  const routes = new Hono()

  routes.get('/me', async (c) => {
    const u = await user(c)
    return u ? c.json<MeResponse>({ ...u, dev: false }) : c.json({ error: 'Inte inloggad' }, 401)
  })

  routes.get('/login', async (c) => {
    let cfg: oidc.Configuration
    try {
      cfg = await getConfig()
    } catch (e) {
      console.error('[bygg] Kunde inte nå inloggningen', e)
      return page(c, 502, 'Inloggningen går inte att nå just nu.')
    }
    const verifier = oidc.randomPKCECodeVerifier()
    const state = oidc.randomState()
    const login: LoginState = { state, verifier, returnTo: safeReturn(c.req.query('return')) }
    await setSignedCookie(c, LOGIN_COOKIE, JSON.stringify(login), secret, {
      path: '/auth',
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      maxAge: LOGIN_MAX_AGE_S,
    })
    const url = oidc.buildAuthorizationUrl(cfg, {
      redirect_uri: new URL('/auth/callback', app).href,
      scope: 'openid profile email',
      state,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
    })
    return c.redirect(url.href)
  })

  routes.get('/callback', async (c) => {
    const raw = await getSignedCookie(c, secret, LOGIN_COOKIE)
    deleteCookie(c, LOGIN_COOKIE, { path: '/auth', secure })
    // Ingen omdirigering till /auth/login här: går cookien inte att sätta blir det en loop.
    if (!raw) return page(c, 400, 'Inloggningen tog för lång tid, eller startades i en annan flik.')
    let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>
    try {
      const login = JSON.parse(raw) as LoginState
      // Adressen som Pocket ID skickade oss till, sedd utifrån (servern står bakom en proxy).
      const current = new URL('/auth/callback' + new URL(c.req.url).search, app)
      tokens = await oidc.authorizationCodeGrant(await getConfig(), current, {
        pkceCodeVerifier: login.verifier,
        expectedState: login.state,
      })
      const claims = tokens.claims()
      if (!claims || !SUB_PATTERN.test(claims.sub)) throw new Error('Ogiltigt användar-id')
      const name = [claims.name, claims.preferred_username, claims.email].find(
        (x): x is string => typeof x === 'string' && x.length > 0,
      )
      const session: Session = { sub: claims.sub, name: name ?? claims.sub, exp: now() + SESSION_DAYS * 86_400_000 }
      await opts.onLogin?.(session)
      await setSignedCookie(c, sessionCookie, JSON.stringify(session), secret, {
        path: '/',
        httpOnly: true,
        secure,
        sameSite: 'Lax',
        maxAge: SESSION_DAYS * 86_400,
      })
      return c.redirect(login.returnTo)
    } catch (e) {
      console.warn('[bygg] Inloggningen misslyckades', e)
      return page(c, 403, 'Inloggningen misslyckades.')
    }
  })

  // Loggar ut här och i Pocket ID, annars loggar Pocket ID in en direkt igen.
  routes.post('/logout', async (c) => {
    deleteCookie(c, sessionCookie, { path: '/', secure })
    const home = new URL('/', app).href
    try {
      const cfg = await getConfig()
      if (!cfg.serverMetadata().end_session_endpoint) return c.json({ redirect: home })
      const url = oidc.buildEndSessionUrl(cfg, { post_logout_redirect_uri: home })
      return c.json({ redirect: url.href })
    } catch {
      return c.json({ redirect: home })
    }
  })

  return { user, routes, origin: app.origin }
}
