import { create } from 'zustand'

export type FitTarget = 'all' | 'selection'

interface ViewState {
  /** Senaste begäran att zooma så att något syns. n ändras vid varje begäran, även till samma mål. */
  fit: { target: FitTarget; n: number } | null
  requestFit: (target: FitTarget) => void
  /** Detaljpanelen på bred skärm. På smal skärm är den ett blad som alltid finns. */
  panelOpen: boolean
  togglePanel: () => void
  /** Fokusläge (Tab, som i Photoshop): bara 3D-vyn, utan raden överst och detaljpanelen. Sparas inte. */
  focusMode: boolean
  toggleFocusMode: () => void
  /**
   * Mellanslag hålls nere: dra med musen för att panorera (som i Photoshop).
   * used = man har panorerat sedan mellanslaget trycktes; släpps det utan
   * att man panorerat blir det som förut ett byte till Välj.
   */
  spacePan: { held: boolean; used: boolean }
  setSpacePan: (p: { held: boolean; used: boolean }) => void
}

const PANEL_KEY = 'bygg.panelOpen'

/** Valet sparas per enhet. Utan lagring (privat fönster m.m.) är panelen öppen. */
function readPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== 'false'
  } catch {
    return true
  }
}

function savePanelOpen(open: boolean) {
  try {
    localStorage.setItem(PANEL_KEY, String(open))
  } catch {
    // Går inte att spara; valet gäller tills sidan laddas om.
  }
}

/** Kamerabegäran från knappar och kortkommandon utanför 3D-vyn. Kameran själv ligger i CameraRig. */
export const useViewStore = create<ViewState>()((set) => ({
  fit: null,
  requestFit: (target) => set((s) => ({ fit: { target, n: (s.fit?.n ?? 0) + 1 } })),
  spacePan: { held: false, used: false },
  setSpacePan: (spacePan) => set({ spacePan }),
  focusMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  panelOpen: readPanelOpen(),
  togglePanel: () =>
    set((s) => {
      savePanelOpen(!s.panelOpen)
      return { panelOpen: !s.panelOpen }
    }),
}))
