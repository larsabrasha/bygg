import { describe, expect, it } from 'vitest'
import { emptyCatalog, type Catalog } from '../model/catalog'
import type { CatalogApi } from './api'
import { syncCatalogOnce } from './catalogSync'
import type { ServerCatalog } from './protocol'

/** En server i minnet med samma revisionsregler som den riktiga. */
function memoryServer(initial: ServerCatalog | null = null): CatalogApi & { current: ServerCatalog | null } {
  const server = {
    current: initial,
    async getCatalog() {
      return server.current
    },
    async putCatalog({ baseRevision, catalog }: { baseRevision: number | null; catalog: Catalog }) {
      if ((server.current?.revision ?? null) !== baseRevision) return { ok: false as const, current: server.current }
      server.current = { revision: (server.current?.revision ?? 0) + 1, updatedAt: 't', catalog }
      return { ok: true as const, revision: server.current.revision, updatedAt: 't' }
    },
  }
  return server
}

const withColor = (id: string): Catalog => ({
  ...emptyCatalog(),
  colors: [{ id, name: id, color: '#112233', updatedAt: '2026-09-27T10:00:00Z' }],
})

describe('syncCatalogOnce', () => {
  it('laddar upp en ändrad lista, och hämtar en nyare utan egna ändringar', async () => {
    const server = memoryServer()
    const pushed = await syncCatalogOnce(server, { catalog: withColor('a'), baseRevision: null, dirty: true })
    expect(pushed).toMatchObject({ baseRevision: 1, dirty: false })
    server.current = { revision: 2, updatedAt: 't', catalog: withColor('b') }
    const pulled = await syncCatalogOnce(server, pushed)
    expect(pulled.catalog.colors.map((c) => c.id)).toEqual(['b'])
    expect(pulled.baseRevision).toBe(2)
  })

  it('slår ihop vid krock, så att båda enheternas färger finns kvar', async () => {
    const server = memoryServer({ revision: 3, updatedAt: 't', catalog: withColor('från-ipad') })
    const r = await syncCatalogOnce(server, { catalog: withColor('från-datorn'), baseRevision: 2, dirty: true })
    expect(r).toMatchObject({ baseRevision: 4, dirty: false })
    expect(server.current!.catalog.colors.map((c) => c.id).sort()).toEqual(['från-datorn', 'från-ipad'])
  })

  it('laddar upp igen om servern tappat listan, men inte en tom lista', async () => {
    const server = memoryServer()
    expect(await syncCatalogOnce(server, { catalog: emptyCatalog(), baseRevision: null, dirty: false })).toMatchObject({
      dirty: false,
    })
    expect(server.current).toBeNull()
    const r = await syncCatalogOnce(server, { catalog: withColor('a'), baseRevision: 5, dirty: false })
    expect(r).toMatchObject({ baseRevision: 1, dirty: false })
  })
})
