import { describe, expect, it } from 'vitest'
import { serialize } from '../persist/format'
import { importLegacy, memoryRepo } from './localRepo'

const doc = { sketches: [], defs: [], instances: [], params: [] }

describe('importLegacy', () => {
  it('flyttar den gamla enkelmodellen till modellistan som osynkad', async () => {
    const repo = memoryRepo()
    let marked = false
    const id = await importLegacy(
      repo,
      async () => serialize(doc),
      async () => {
        marked = true
      },
      () => 'ny-id',
    )
    expect(id).toBe('ny-id')
    expect(marked).toBe(true)
    expect(await repo.get('ny-id')).toMatchObject({ name: 'Min modell', dirty: true, baseRevision: null })
  })

  it('gör inget när det inte finns någon gammal modell', async () => {
    const repo = memoryRepo()
    expect(
      await importLegacy(
        repo,
        async () => undefined,
        async () => {},
        () => 'x',
      ),
    ).toBeNull()
    expect(await repo.list()).toEqual([])
  })
})
