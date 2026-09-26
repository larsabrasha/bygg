import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setViewCapturer } from '../scene/viewCapture'
import { usePrintStore } from '../store/printStore'
import { useViewStore } from '../store/viewStore'
import { printExploded } from './explodeActions'

const image = { url: 'data:image/png;base64,', width: 10, height: 10, labels: [] }

describe('printExploded', () => {
  const print = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('document', { title: 'Bygg' })
    vi.stubGlobal('window', { print })
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0))
    setViewCapturer(() => image)
    useViewStore.getState().setExploded(true)
  })
  afterEach(() => {
    useViewStore.getState().setExploded(false)
    setViewCapturer(null)
    vi.unstubAllGlobals()
    print.mockReset()
  })

  it('behåller bilden efter afterprint, som på iPhone kommer innan förhandsvisningen ritats', async () => {
    await printExploded('Matgrupp')
    expect(print).toHaveBeenCalledOnce()
    expect(usePrintStore.getState()).toMatchObject({ what: 'exploded', image })
    expect(document.title).toBe('Matgrupp – sprängskiss')
  })

  it('tar bort bilden och ger sidan sin rubrik igen när sprängskissen stängs', async () => {
    await printExploded('Matgrupp')
    useViewStore.getState().setExploded(false)
    expect(usePrintStore.getState().what).toBe('none')
    expect(document.title).toBe('Bygg')
  })

  it('en andra utskrift tar över den första utan att rubriken fastnar', async () => {
    await printExploded('Matgrupp')
    await printExploded('Matgrupp')
    useViewStore.getState().setExploded(false)
    expect(document.title).toBe('Bygg')
    expect(usePrintStore.getState().what).toBe('none')
  })
})
