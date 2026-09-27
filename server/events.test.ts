import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serialize } from '../src/persist/format'
import { createApp } from './app'
import { devAuth } from './auth'
import { ChangeHub, MAX_STREAMS_PER_USER } from './events'
import { UserStorages } from './storage'

const ID = '11111111-2222-4333-8444-555555555555'
const CLIENT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const file = serialize({ sketches: [], defs: [], instances: [], params: [] }, new Date('2026-09-25T10:00:00Z'))

let dir: string
let app: ReturnType<typeof createApp>
let hub: ChangeHub

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'bygg-events-'))
  hub = new ChangeHub()
  app = createApp({ storages: new UserStorages(dir), auth: devAuth(), hub, heartbeatMs: 20 })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** Läser strömmen tills text dyker upp. */
async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string) {
  const decoder = new TextDecoder()
  let text = ''
  while (!text.includes(needle)) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value)
  }
  return text
}

const put = (baseRevision: number | null, headers: Record<string, string> = {}) =>
  app.request(`/api/models/${ID}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'Bord', baseRevision, file }),
    headers: { 'content-type': 'application/json', ...headers },
  })

describe('/api/events', () => {
  it('skickar sparningar och borttagningar, med fliken som gjorde dem', async () => {
    const ac = new AbortController()
    const r = await app.request('/api/events', { signal: ac.signal })
    expect(r.headers.get('content-type')).toBe('text/event-stream')
    const reader = r.body!.getReader()
    expect(await readUntil(reader, 'event: ready')).toContain('retry: 5000')

    await put(null, { 'x-bygg-client': CLIENT })
    const saved = await readUntil(reader, 'event: change')
    expect(JSON.parse(saved.split('data: ')[1]!.split('\n')[0]!)).toEqual({
      kind: 'model',
      id: ID,
      revision: 1,
      by: CLIENT,
    })

    await app.request(`/api/models/${ID}?baseRevision=1`, { method: 'DELETE' })
    expect(await readUntil(reader, '"kind":"delete"')).toContain(ID)

    // Livstecken när inget händer.
    expect(await readUntil(reader, ': \n')).toBeTruthy()
    ac.abort()
    await reader.cancel()
  })

  it('en krock (409) skickas inte ut', async () => {
    await put(null)
    const events: unknown[] = []
    hub.subscribe('dev', (e) => events.push(e))
    expect((await put(null)).status).toBe(409)
    expect(events).toEqual([])
  })

  it('har ett tak för antal strömmar per användare, och släpper en stängd', async () => {
    const offs = Array.from({ length: MAX_STREAMS_PER_USER }, () => hub.subscribe('dev', () => {}))
    expect((await app.request('/api/events')).status).toBe(429)
    offs[0]!()
    expect(hub.count('dev')).toBe(MAX_STREAMS_PER_USER - 1)
    expect(hub.subscribe('dev', () => {})).not.toBeNull()
  })
})
