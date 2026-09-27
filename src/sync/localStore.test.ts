import 'fake-indexeddb/auto'
import * as idb from 'idb-keyval'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetUser, startAuth } from './auth'
import { get, guestDb, isGuest, keys, selectGuest, selectUser, set, userDb } from './localStore'

/**
 * Den lokala lagringen ska vara uppdelad per användare: den som loggar in efter
 * någon annan på samma enhet ska aldrig se den andras modeller, varken inloggad,
 * offline eller utan konto.
 */

const all = (store?: idb.UseStore) => idb.entries(store).then((e) => Object.fromEntries(e))

beforeEach(async () => {
  await Promise.all([idb.clear(), idb.clear(userDb('a')), idb.clear(userDb('b')), idb.clear(guestDb())])
  vi.unstubAllGlobals()
})

describe('en databas per användare', () => {
  it('modellerna från före inloggningen går till den första som loggar in', async () => {
    await idb.set('bygg:model:1', { name: 'Gammal' })
    await selectUser('a')
    expect(await get('bygg:model:1')).toEqual({ name: 'Gammal' })
    // I standarddatabasen finns bara vem som äger dem.
    expect(await all()).toEqual({ 'bygg:owner': 'a' })
  })

  it('nästa användare ser inget av den förstas', async () => {
    await idb.set('bygg:model:1', { name: 'Gammal' })
    await selectUser('a')
    await set('bygg:model:2', { name: 'A:s' })
    await selectUser('b')
    expect(await keys()).toEqual([])
    await set('bygg:model:3', { name: 'B:s' })
    expect(Object.keys(await all(userDb('a'))).sort()).toEqual(['bygg:model:1', 'bygg:model:2'])
    expect(Object.keys(await all(userDb('b')))).toEqual(['bygg:model:3'])
  })

  it('en flytt som avbröts skriver inte över det som redan finns hos användaren', async () => {
    await idb.set('bygg:owner', 'a')
    await idb.set('bygg:model:1', { name: 'Gammal kopia' })
    await idb.set('bygg:model:1', { name: 'Nyare' }, userDb('a'))
    await selectUser('a')
    expect(await get('bygg:model:1')).toEqual({ name: 'Nyare' })
    expect(await idb.get('bygg:model:1')).toBeUndefined()
  })

  it('utan konto: en egen databas, skild från användarnas', async () => {
    await selectUser('a')
    await set('bygg:model:1', { name: 'A:s' })
    selectGuest()
    expect(isGuest()).toBe(true)
    expect(await keys()).toEqual([])
    await set('bygg:model:2', { name: 'Gästens' })
    await selectUser('a')
    expect(isGuest()).toBe(false)
    expect(await keys()).toEqual(['bygg:model:1'])
  })
})

/** Servern svarar som den gör: inloggad, utloggad eller inte alls. */
function server(answer: 'a' | 'b' | 'logged-out' | 'offline') {
  vi.stubGlobal('fetch', async () => {
    if (answer === 'offline') throw new TypeError('Failed to fetch')
    if (answer === 'logged-out')
      return new Response(JSON.stringify({ error: 'Inte inloggad' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    return new Response(JSON.stringify({ sub: answer, name: answer, dev: false }), {
      headers: { 'content-type': 'application/json' },
    })
  })
}

describe('vid start', () => {
  it('inloggad: användarens databas', async () => {
    server('a')
    expect(await startAuth()).toBe('app')
    await set('bygg:model:1', { name: 'A:s' })
    expect(await idb.get('bygg:model:1', userDb('a'))).toEqual({ name: 'A:s' })
  })

  it('utloggad: startsidan, och inga modeller öppnas', async () => {
    server('logged-out')
    expect(await startAuth()).toBe('landing')
  })

  it('utloggad men valt att köra utan konto: gästens databas', async () => {
    await idb.set('bygg:guest', true)
    server('logged-out')
    expect(await startAuth()).toBe('app')
    expect(isGuest()).toBe(true)
  })

  it('att logga in tar bort valet att köra utan konto', async () => {
    await idb.set('bygg:guest', true)
    server('a')
    await startAuth()
    expect(isGuest()).toBe(false)
    expect(await idb.get('bygg:guest')).toBeUndefined()
  })

  it('offline: den som senast var inloggad', async () => {
    server('a')
    await startAuth()
    await set('bygg:model:1', { name: 'A:s' })
    server('offline')
    expect(await startAuth()).toBe('app')
    expect(await get('bygg:model:1')).toEqual({ name: 'A:s' })
  })

  it('offline efter utloggning: startsidan, inte den förras modeller', async () => {
    server('a')
    await startAuth()
    await forgetUser()
    server('offline')
    expect(await startAuth()).toBe('landing')
  })

  it('en annan användare efter utloggning ser inte den förras modeller', async () => {
    server('a')
    await startAuth()
    await set('bygg:model:1', { name: 'A:s' })
    await forgetUser()
    server('b')
    await startAuth()
    expect(await keys()).toEqual([])
  })
})
