import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LIMITS } from '../src/model/limits'
import { resolveBodies } from '../src/model/resolve'
import { emptyDocument } from '../src/store/documentStore'
import { createApp } from '../server/app'
import { devAuth } from '../server/auth'
import { UserStorages } from '../server/storage'
import { TokenStore } from '../server/tokens'
import { httpClient } from './client'
import { run, type Io } from './main'
import { applyOps } from './ops'

describe('applyOps', () => {
  const box = { op: 'box', name: 'Skiva', size: [800, 22, 400], at: [0, 700, 0], material: 'ek', grain: 'x', ref: 's' }

  it('bygger en låda med rätt mått, läge och fiber', () => {
    const r = applyOps(emptyDocument(), [box])
    if (!r.ok) throw new Error(r.error)
    const [b] = resolveBodies(r.doc)
    expect(b).toMatchObject({ name: 'Skiva', material: 'ek', id: r.refs.s })
    const def = r.doc.defs[0]!
    // u = +x, v = −z, n = +y: fibern längs x är u, tjockleken (22, längs y) är n.
    expect([def.grainAxis, def.thicknessAxis]).toEqual(['u', 'n'])
    expect(b!.frame.origin).toEqual([0, 700, 400])
  })

  it('mått och lägen som uttryck följer parametrarna', () => {
    const r = applyOps(emptyDocument(), [
      { op: 'param', name: 'bredd', expr: 800 },
      { ...box, size: ['bredd', 22, 400], at: [0, 'bredd - 100', 0] },
      { op: 'param', name: 'bredd', expr: 1000 },
    ])
    if (!r.ok) throw new Error(r.error)
    const def = r.doc.defs[0]!
    expect(def.profile.x1 - def.profile.x0).toBe(1000)
    expect(r.doc.instances[0]!.frame.origin[1]).toBe(900)
  })

  it('allt eller inget: ett fel mitt i stoppar hela listan', () => {
    const doc = emptyDocument()
    const r = applyOps(doc, [box, { op: 'move', id: 'finns-inte', by: [1, 0, 0] }])
    expect(r).toMatchObject({ ok: false, index: 1 })
    expect(doc.instances).toHaveLength(0)
  })

  it('avvisar okända operationer och fält', () => {
    expect(applyOps(emptyDocument(), [{ op: 'explode' }])).toMatchObject({ ok: false, error: /Okänd operation/ })
    expect(applyOps(emptyDocument(), [{ ...box, colour: 'röd' }])).toMatchObject({ ok: false, error: /fält "colour"/ })
  })

  it('länkade kopior, tapp och urtag som i appen', () => {
    const r = applyOps(emptyDocument(), [
      { op: 'box', name: 'Ben', size: [45, 700, 45], ref: 'ben' },
      { op: 'copy', id: 'ben', by: [500, 0, 0], ref: 'ben2' },
      { op: 'box', name: 'Sarg', size: [455, 80, 20], at: [45, 600, 12], ref: 'sarg' },
      { op: 'joint', host: 'sarg', into: 'ben' },
      { op: 'cylinder', diameter: 10, length: 45, axis: 'z', at: [15, 100, 0], ref: 'hål' },
      { op: 'subtract', tool: 'hål', host: 'ben2' },
    ])
    if (!r.ok) throw new Error(r.error)
    const bodies = resolveBodies(r.doc)
    expect(bodies.filter((b) => b.defId === bodies[0]!.defId)).toHaveLength(2)
    expect(bodies.filter((b) => b.tool).map((b) => b.tool!.op)).toEqual(['joint', 'subtract'])
  })

  it('gränserna gäller: för många delar och för långt bort', () => {
    const many = applyOps(emptyDocument(), [
      { op: 'box', size: [10, 10, 10], ref: 'a' },
      ...Array.from({ length: 10 }, () => ({ op: 'copy', id: 'a', by: [0, 0, 11], count: 200 })),
    ])
    expect(many).toMatchObject({ ok: false, error: new RegExp(`högst ${LIMITS.instances} delar`) })
    const far = applyOps(emptyDocument(), [{ op: 'box', size: [10, 10, 10], at: [LIMITS.extent, 0, 0] }])
    expect(far).toMatchObject({ ok: false, error: /från origo/ })
    const count = applyOps(emptyDocument(), [
      { op: 'box', size: [10, 10, 10], ref: 'a' },
      { op: 'copy', id: 'a', by: [0, 0, 11], count: 5000 },
    ])
    expect(count).toMatchObject({ ok: false, error: /count/ })
    expect(applyOps(emptyDocument(), Array(501).fill(box))).toMatchObject({ ok: false, error: /Högst 500/ })
  })
})

describe('bygg mot servern', () => {
  let dir: string
  let out: string[]
  let err: string[]
  let tokens: TokenStore
  let app: ReturnType<typeof createApp>
  let stdin = ''

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bygg-cli-'))
    tokens = new TokenStore(dir)
    // Som produktionen: utan nyckel är man inte inloggad.
    const auth = { ...devAuth(), user: async () => null, routes: new Hono() }
    app = createApp({ storages: new UserStorages(dir), auth, tokens })
    out = []
    err = []
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const io = (env: Record<string, string> = {}): Io => ({
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    readStdin: async () => stdin,
    stdinIsTty: false,
    env: { XDG_CONFIG_HOME: path.join(dir, 'config'), ...env },
    api: (server, token) => httpClient(server, token, (url, init) => Promise.resolve(app.request(url, init))),
    openBrowser: () => {},
  })

  it('login sparar nyckeln (bara för ägaren), och sedan fungerar edit, show och logout', async () => {
    const { token } = await tokens.create({ sub: 'anna', name: 'Anna' }, 'test')
    stdin = `${token}\n`
    expect(await run(['login', '--server', 'https://bygg.test'], io())).toBe(0)
    const file = path.join(dir, 'config', 'bygg', 'config.json')
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ server: 'https://bygg.test', token })
    expect((await stat(file)).mode & 0o777).toBe(0o600)

    expect(await run(['new', 'Hylla'], io())).toBe(0)
    const ops = JSON.stringify([{ op: 'box', name: 'Sida', size: [18, 1800, 300], material: 'björk', grain: 'y' }])
    expect(await run(['edit', 'Hylla', '--ops', ops], io())).toBe(0)
    expect(out.at(-1)).toMatch(/revision 2/)
    out = []
    expect(await run(['cutlist', 'hylla', '--json'], io())).toBe(0)
    expect(JSON.parse(out.join('\n')).rows[0]).toMatchObject({ count: 1, L: 1800, B: 300, T: 18, material: 'björk' })

    expect(await run(['logout'], io())).toBe(0)
    expect(await tokens.list('anna')).toEqual([])
    expect(await run(['list'], io())).toBe(1)
    expect(err.at(-1)).toMatch(/Inte inloggad/)
  })

  it('skickar aldrig nyckeln till en annan server än den den skapades på', async () => {
    const { token } = await tokens.create({ sub: 'anna', name: 'Anna' }, 'test')
    stdin = token
    await run(['login', '--server', 'https://bygg.test'], io())
    const seen: (string | null)[] = []
    const spy: Io = {
      ...io(),
      api: (server, t) =>
        httpClient(server, t, (url, init) => {
          seen.push(new Headers(init.headers).get('authorization'))
          return Promise.resolve(app.request(url, init))
        }),
    }
    await run(['list', '--server', 'https://annan.test'], spy)
    expect(seen).toEqual([null])
  })

  it('en fil med operationer: fel ger felkod och ingenting sparas', async () => {
    const { token } = await tokens.create({ sub: 'anna', name: 'Anna' }, 'test')
    const env = { BYGG_SERVER: 'https://bygg.test', BYGG_TOKEN: token }
    await run(['new', 'Bänk'], io(env))
    const ops = path.join(dir, 'ops.json')
    await writeFile(
      ops,
      JSON.stringify([
        { op: 'box', size: [100, 100, 100] },
        { op: 'delete', id: 'saknas' },
      ]),
    )
    expect(await run(['edit', 'Bänk', ops], io(env))).toBe(1)
    expect(err.at(-1)).toMatch(/Operation 2: Ingen del "saknas". Inget sparades./)
    out = []
    await run(['show', 'Bänk', '--json'], io(env))
    expect(JSON.parse(out.join('\n'))).toMatchObject({ revision: 1, counts: { parts: 0 } })
  })

  it('lokala filer: new, edit och show utan server', async () => {
    const file = path.join(dir, 'pall.bygg.json')
    expect(await run(['new', 'Pall', '--file', file], io())).toBe(0)
    expect(await run(['new', 'Pall', '--file', file], io())).toBe(1)
    const ops = JSON.stringify([{ op: 'box', name: 'Sits', size: [350, 22, 350], at: [0, 450, 0] }])
    expect(await run(['edit', file, '--ops', ops], io())).toBe(0)
    out = []
    expect(await run(['show', file], io())).toBe(0)
    expect(out.join('\n')).toMatch(/Sits {2}Furu {2}350 × 350 × 22/)
  })
})
