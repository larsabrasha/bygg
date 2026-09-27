import { beforeEach, describe, expect, it } from 'vitest'
import { BUILT_IN_COLORS, emptyCatalog } from '../model/catalog'
import { useCatalogStore } from './catalogStore'

const s = () => useCatalogStore.getState()
const ids = BUILT_IN_COLORS.map((c) => c.id)

describe('catalogStore', () => {
  beforeEach(() => s().replace(emptyCatalog(), null, false))

  it('döljer och visar alla inbyggda på en gång, som en ändring', () => {
    s().setHidden(ids[0]!, true)
    const before = s().version
    s().setHiddenMany(ids, true)
    expect(s().catalog.hidden.sort()).toEqual([...ids].sort())
    expect(s().version).toBe(before + 1)
    s().setHiddenMany(ids, false)
    expect(s().catalog.hidden).toEqual([])
    expect(s().dirty).toBe(true)
  })

  it('räknar inte en ändring som inte ändrar något', () => {
    const before = s().version
    s().setHiddenMany(ids, false)
    expect(s().version).toBe(before)
  })
})
