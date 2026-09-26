import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLibraryStore } from '../../store/libraryStore'
import { menuState, runMenuAction } from './menuActions'

describe('meddelanden i VR-menyn', () => {
  beforeEach(() => useLibraryStore.setState({ notices: [] }))

  it('visar det senaste och hur många som finns', () => {
    expect(menuState().notice).toBeNull()
    const lib = useLibraryStore.getState()
    lib.notify('Första.')
    const id = lib.notify('Andra.', { label: 'Ångra', run: () => {} })
    expect(menuState().notice).toEqual({ id, text: 'Andra.', action: 'Ångra', count: 2 })
  })

  it('Stäng tar bort det, och då syns nästa', () => {
    const lib = useLibraryStore.getState()
    const first = lib.notify('Första.')
    const second = lib.notify('Andra.')
    runMenuAction({ kind: 'dismiss', id: second })
    expect(menuState().notice?.id).toBe(first)
  })

  it('meddelandets knapp gör som i 3D-vyn, och meddelandet ligger kvar', () => {
    const run = vi.fn()
    const id = useLibraryStore.getState().notify('"Byrå" togs bort.', { label: 'Ångra', run })
    runMenuAction({ kind: 'noticeAction', id })
    expect(run).toHaveBeenCalledOnce()
    expect(menuState().notice?.id).toBe(id)
  })
})
