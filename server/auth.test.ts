import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Hono } from 'hono'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serialize } from '../src/persist/format'
import { createApp } from './app'
import { noAuth, oidcAuth, safeReturn, type Auth } from './auth'
import { UserStorages } from './storage'

/**
 * Hela inloggningen mot en låtsad Pocket ID (discovery, token, JWKS), med den
 * riktiga OIDC-klienten (openid-client). Den låtsade utgivaren kontrollerar PKCE,
 * redirect_uri och klienthemligheten som den riktiga.
 */

const ISSUER = 'http://id.test'
const APP = 'http://bygg.test'
// Som Pocket ID:s: ett UUID, med tecken som URL-kodas i en Basic-header.
const CLIENT_ID = '4e200c4b-9123-4f26-b545-7a0850842805'
const CLIENT_SECRET = 'hemlig'
const MODEL_ID = '11111111-2222-4333-8444-555555555555'
const file = serialize({ sketches: [], defs: [], instances: [], params: [] }, new Date('2026-09-25T10:00:00Z'))

const { privateKey, publicKey } = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }

/** Koder som utgivaren har gett ut: code → vem och vilken PKCE-utmaning. */
const codes = new Map<string, { sub: string; name: string; challenge: string; redirectUri: string }>()

const idp = new Hono()
idp.get('/.well-known/openid-configuration', (c) =>
  c.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/api/oidc/token`,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    end_session_endpoint: `${ISSUER}/api/oidc/end-session`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    code_challenge_methods_supported: ['S256'],
  }),
)
idp.get('/.well-known/jwks.json', (c) => c.json({ keys: [jwk] }))
idp.post('/api/oidc/token', async (c) => {
  const form = new URLSearchParams(await c.req.text())
  // Som Pocket ID: id och hemlighet i formuläret, annars i Basic-headern, men där utan URL-avkodning
  // (standarden kräver avkodning; Pocket ID gör det inte, så ett kodat id hittas inte).
  const basic = Buffer.from((c.req.header('authorization') ?? '').replace(/^Basic /, ''), 'base64').toString()
  const [id, secret] = form.get('client_id')
    ? [form.get('client_id'), form.get('client_secret')]
    : [basic.slice(0, basic.indexOf(':')), basic.slice(basic.indexOf(':') + 1)]
  if (id !== CLIENT_ID || secret !== CLIENT_SECRET) return c.json({ error: 'invalid_client' }, 401)
  const grant = codes.get(form.get('code') ?? '')
  codes.delete(form.get('code') ?? '')
  const challenge = createHash('sha256')
    .update(form.get('code_verifier') ?? '')
    .digest('base64url')
  if (!grant || grant.challenge !== challenge || grant.redirectUri !== form.get('redirect_uri'))
    return c.json({ error: 'invalid_grant' }, 400)
  const idToken = await new SignJWT({ name: grant.name })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setSubject(grant.sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
  return c.json({ access_token: 'at', token_type: 'Bearer', expires_in: 300, id_token: idToken })
})

let dir: string
let clock: number
let auth: Auth
let app: ReturnType<typeof createApp>

let storages: UserStorages

function makeAuth(appUrl = APP) {
  return oidcAuth({
    onLogin: (user) => storages.for(user.sub),
    appUrl,
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    sessionSecret: 'x'.repeat(32),
    now: () => clock,
    testFetch: async (url, init) =>
      idp.request(url, { method: init.method, headers: init.headers, body: init.body as BodyInit, redirect: 'manual' }),
  })
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'bygg-auth-'))
  // openid-client kontrollerar id-token mot den riktiga klockan, och utloggningen jämför med när den gavs ut.
  clock = Date.now()
  storages = new UserStorages(dir)
  auth = makeAuth()
  app = createApp({ storages, auth })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** name=value för varje cookie som sattes, som en Cookie-header. */
const cookiesFrom = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')

/** Loggar in som användaren och returnerar session-cookien. */
async function login(sub = 'user-a', name = 'Lars', returnTo = '/m/abc') {
  const start = await app.request(`/auth/login?return=${encodeURIComponent(returnTo)}`)
  expect(start.status).toBe(302)
  const authorize = new URL(start.headers.get('location')!)
  expect(authorize.origin + authorize.pathname).toBe(`${ISSUER}/authorize`)
  const q = authorize.searchParams
  // Användaren loggar in i Pocket ID, som skickar tillbaka en kod.
  const code = `code-${sub}`
  codes.set(code, { sub, name, challenge: q.get('code_challenge')!, redirectUri: q.get('redirect_uri')! })
  const back = await app.request(`/auth/callback?code=${code}&state=${q.get('state')}&iss=${ISSUER}`, {
    headers: { cookie: cookiesFrom(start) },
  })
  return {
    back,
    /** Alla cookies från inloggningen, som en Cookie-header. */
    all: cookiesFrom(back),
    cookie: cookiesFrom(back)
      .split('; ')
      .find((c) => c.startsWith('bygg-session='))!,
  }
}

const putModel = (cookie: string, headers: Record<string, string> = {}) =>
  app.request(`/api/models/${MODEL_ID}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'Bord', baseRevision: null, file }),
    headers: { 'content-type': 'application/json', cookie, ...headers },
  })

describe('inloggning', () => {
  it('loggar in via utgivaren och skickar tillbaka dit man var', async () => {
    const { back, cookie } = await login()
    expect(back.status).toBe(302)
    expect(back.headers.get('location')).toBe('/m/abc')
    expect(back.headers.getSetCookie().find((c) => c.startsWith('bygg-session='))).toMatch(/HttpOnly/i)
    const me = await app.request('/auth/me', { headers: { cookie } })
    expect(await me.json()).toEqual({ sub: 'user-a', name: 'Lars', dev: false })
  })

  it('API:t kräver inloggning', async () => {
    expect((await app.request('/api/models')).status).toBe(401)
    const me = await app.request('/auth/me')
    expect(me.status).toBe(401)
    expect(await me.json()).toEqual({ error: 'Inte inloggad', login: true })
    const { cookie } = await login()
    expect((await app.request('/api/models', { headers: { cookie } })).status).toBe(200)
  })

  it('health är öppen', async () => {
    expect((await app.request('/api/health')).status).toBe(200)
  })

  it('godtar inte en kod med fel state', async () => {
    const start = await app.request('/auth/login')
    const q = new URL(start.headers.get('location')!).searchParams
    codes.set('c', { sub: 'x', name: 'x', challenge: q.get('code_challenge')!, redirectUri: q.get('redirect_uri')! })
    const r = await app.request('/auth/callback?code=c&state=fel', { headers: { cookie: cookiesFrom(start) } })
    expect(r.status).toBe(403)
    expect(r.headers.getSetCookie().some((c) => c.startsWith('bygg-session=') && !c.includes('Max-Age=0'))).toBe(false)
  })

  it('utan inloggningscookie blir det ett fel, inte en loop', async () => {
    const r = await app.request('/auth/callback?code=c&state=s')
    expect(r.status).toBe(400)
  })

  it('när Pocket ID säger nej (t.ex. inte i rätt grupp)', async () => {
    const start = await app.request('/auth/login')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')
    const r = await app.request(`/auth/callback?error=access_denied&state=${state}`, {
      headers: { cookie: cookiesFrom(start) },
    })
    expect(r.status).toBe(403)
  })

  it('sessionen tar slut efter 30 dagar', async () => {
    const { cookie } = await login()
    clock += 29 * 86_400_000
    expect((await app.request('/auth/me', { headers: { cookie } })).status).toBe(200)
    clock += 2 * 86_400_000
    expect((await app.request('/auth/me', { headers: { cookie } })).status).toBe(401)
  })

  it('en ändrad cookie godtas inte', async () => {
    const { cookie } = await login()
    const [name, value] = cookie.split('=', 2) as [string, string]
    const payload = JSON.parse(decodeURIComponent(value).split('.')[0]!)
    const forged = `${name}=${encodeURIComponent(JSON.stringify({ ...payload, sub: 'user-b' }) + '.' + decodeURIComponent(value).split('.').slice(1).join('.'))}`
    expect((await app.request('/auth/me', { headers: { cookie: forged } })).status).toBe(401)
  })

  it('skickar bara tillbaka till sidor i appen', () => {
    expect(safeReturn('/m/abc?x=1')).toBe('/m/abc?x=1')
    expect(safeReturn('//evil.test')).toBe('/')
    expect(safeReturn('/\\evil.test')).toBe('/')
    expect(safeReturn('https://evil.test')).toBe('/')
    expect(safeReturn('/auth/login')).toBe('/')
    expect(safeReturn(undefined)).toBe('/')
  })

  it('utloggning tar bort sessionen och loggar ut i Pocket ID', async () => {
    const { all } = await login()
    const r = await app.request('/auth/logout', { method: 'POST', headers: { cookie: all } })
    const { redirect } = await r.json()
    expect(redirect).toMatch(new RegExp(`^${ISSUER}/api/oidc/end-session\\?`))
    const q = new URL(redirect).searchParams
    expect(q.get('post_logout_redirect_uri')).toBe(`${APP}/`)
    expect(r.headers.getSetCookie().find((c) => c.startsWith('bygg-session='))).toMatch(/Max-Age=0/)
    expect(r.headers.getSetCookie().find((c) => c.startsWith('bygg-id='))).toMatch(/Max-Age=0/)
  })

  it('utloggningen skickar med id-token, annars skickar Pocket ID inte tillbaka en', async () => {
    const { back, all } = await login('user-a')
    const set = back.headers.getSetCookie().find((c) => c.startsWith('bygg-id='))!
    expect(set).toMatch(/HttpOnly/i)
    expect(set).toMatch(/Path=\/auth(;|$)/)
    const r = await app.request('/auth/logout', { method: 'POST', headers: { cookie: all } })
    const hint = new URL((await r.json()).redirect).searchParams.get('id_token_hint')!
    const claims = JSON.parse(Buffer.from(hint.split('.')[1]!, 'base64url').toString())
    expect(claims).toMatchObject({ sub: 'user-a', aud: CLIENT_ID, iss: ISSUER })
  })

  it('är man redan utloggad i Pocket ID går man direkt tillbaka hit', async () => {
    // Pocket ID:s inloggning räcker 60 minuter; på dess utloggningssida kommer man inte tillbaka.
    const { all } = await login()
    clock += 61 * 60_000
    const r = await app.request('/auth/logout', { method: 'POST', headers: { cookie: all } })
    expect(await r.json()).toEqual({ redirect: `${APP}/` })
    expect(r.headers.getSetCookie().find((c) => c.startsWith('bygg-session='))).toMatch(/Max-Age=0/)
  })

  it('en session från före id-token-cookien går direkt tillbaka hit', async () => {
    const { cookie } = await login()
    const r = await app.request('/auth/logout', { method: 'POST', headers: { cookie } })
    expect(await r.json()).toEqual({ redirect: `${APP}/` })
  })

  it('med https: __Host-cookie med Secure', async () => {
    const httpsAuth = makeAuth('https://bygg.test')
    const r = await httpsAuth.routes.request('/login')
    expect(r.headers.getSetCookie()[0]).toMatch(/Secure/)
  })
})

describe('modeller per användare', () => {
  it('varje användare ser bara sina egna modeller', async () => {
    const a = (await login('user-a')).cookie
    const b = (await login('user-b')).cookie
    expect((await putModel(a)).status).toBe(200)
    expect(await (await app.request('/api/models', { headers: { cookie: b } })).json()).toEqual([])
    expect((await app.request(`/api/models/${MODEL_ID}`, { headers: { cookie: b } })).status).toBe(404)
    expect(await readdir(path.join(dir, 'users', 'user-a', 'models'))).toEqual([`${MODEL_ID}.json`])
  })

  it('säger nej när klientens användare inte är den inloggade', async () => {
    const a = (await login('user-a')).cookie
    expect((await putModel(a, { 'x-bygg-user': 'user-b' })).status).toBe(401)
    expect((await putModel(a, { 'x-bygg-user': 'user-a' })).status).toBe(200)
  })

  it('ändrande anrop från en annan origin avvisas', async () => {
    const a = (await login('user-a')).cookie
    expect((await putModel(a, { origin: 'https://annan.larsabrasha.com' })).status).toBe(403)
    expect((await putModel(a, { origin: APP })).status).toBe(200)
  })

  it('modellerna från före inloggningen går till den första som loggar in', async () => {
    await mkdir(path.join(dir, 'models'), { recursive: true })
    await writeFile(
      path.join(dir, 'models', `${MODEL_ID}.json`),
      JSON.stringify({ id: MODEL_ID, name: 'Gammal', revision: 3, updatedAt: '2026-09-01T00:00:00Z', file }),
    )
    const a = (await login('user-a')).cookie
    const b = (await login('user-b')).cookie
    expect(await (await app.request('/api/models', { headers: { cookie: b } })).json()).toEqual([])
    expect(await (await app.request('/api/models', { headers: { cookie: a } })).json()).toMatchObject([
      { id: MODEL_ID, name: 'Gammal', revision: 3 },
    ])
    expect(await readdir(dir)).toEqual(['users'])
  })
})

describe('utan inloggning', () => {
  let bare: ReturnType<typeof createApp>
  beforeEach(() => {
    bare = createApp({ storages: new UserStorages(dir), auth: noAuth(APP) })
  })

  it('säger att det inte går att logga in, och API:t är stängt', async () => {
    const me = await bare.request('/auth/me')
    expect(me.status).toBe(401)
    expect(await me.json()).toEqual({ error: 'Inte inloggad', login: false })
    expect((await bare.request('/api/models')).status).toBe(401)
    expect((await bare.request('/api/models', { headers: { authorization: 'Bearer x' } })).status).toBe(401)
    expect((await bare.request('/api/health')).status).toBe(200)
  })

  it('inloggningen leder inte vidare, och det finns ingen sida för nycklar', async () => {
    const r = await bare.request('/auth/login?return=/m/abc')
    expect(r.status).toBe(404)
    expect(await r.text()).not.toContain('/auth/login')
    expect((await bare.request('/auth/cli')).status).toBe(404)
    expect(await (await bare.request('/auth/logout', { method: 'POST' })).json()).toEqual({ redirect: '/' })
  })

  it('skriver inget på disk', async () => {
    await bare.request('/api/models')
    expect(await readdir(dir)).toEqual([])
  })
})
