import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from './id'

describe('newId', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ger UUID v4-format', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('ger olika id varje gång', () => {
    const ids = new Set(Array.from({ length: 1000 }, newId))
    expect(ids.size).toBe(1000)
  })

  it('fungerar utan crypto.randomUUID (som utanför secure context)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    expect(crypto.randomUUID).toBeUndefined()
    expect(newId()).toHaveLength(36)
  })
})
