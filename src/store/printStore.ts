import { create } from 'zustand'

/** En bild av 3D-vyn med namn på delarna, i andelar av bildens bredd och höjd (0–1). */
export interface ViewImage {
  url: string
  width: number
  height: number
  labels: { name: string; x: number; y: number }[]
}

interface PrintState {
  /**
   * Vad som skrivs ut: sprängskissen (ExplodeBar) eller ritningen, där
   * kaplistan är sista bladet. none: inget; appen själv skrivs aldrig ut.
   */
  what: 'none' | 'exploded' | 'drawing'
  image: ViewImage | null
  setPrint: (what: PrintState['what'], image?: ViewImage | null) => void
}

export const usePrintStore = create<PrintState>()((set) => ({
  what: 'none',
  image: null,
  setPrint: (what, image = null) => set({ what, image }),
}))
