import { create } from 'zustand'

export type FitTarget = 'all' | 'selection'

export interface ViewState {
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
  /**
   * Sprängskissen: delarna flyttas bort från modellens mitt (model/explode.ts),
   * explodeAmount gånger avståndet. Bara för att titta och skriva ut; man ändrar
   * inga delar då. Sparas inte.
   */
  exploded: boolean
  explodeAmount: number
  /** Hur långt isär delarna står just nu: glider mot explodeAmount (eller 0) när läget slås av och på. */
  explodeShown: number
  setExploded: (on: boolean) => void
  setExplodeAmount: (amount: number) => void
  setExplodeShown: (shown: number) => void
  /**
   * Pennläget: fingrarna styr bara kameran och pennan ritar (se fingerOnlyCamera).
   * Slås på varje gång pennan nuddar skärmen, och av med knappen i verktygen.
   * Sparas inte.
   */
  penMode: boolean
  setPenMode: (on: boolean) => void
  /** Längd, bredd och tjocklek visas vid den valda delen (knappen Mått). Av från början; sparas inte. */
  showDims: boolean
  toggleDims: () => void
  /**
   * Som i Shapr3D: dolda delar (hidden) ritas inte. Är isolated satt ritas allt
   * utom de isolerade genomskinligt och går inte att trycka på; man ser det och
   * kan snäppa mot det. Så når man sidor som annars skyms av andra delar. Bara
   * för att titta: kaplistan räknar dem som vanligt. Sparas inte, och nollställs
   * när en annan modell öppnas.
   */
  hidden: string[]
  isolated: string[] | null
  hide: (ids: string[]) => void
  isolate: (ids: string[]) => void
  showAll: () => void
}

/** Om kopian id ritas som vanligt (inte dold, och inte genomskinlig för att något annat är isolerat). host = kopian ett verktyg sitter på, som det följer. */
export function isShown(view: Pick<ViewState, 'hidden' | 'isolated'>, id: string, host?: string): boolean {
  const key = host ?? id
  return view.isolated ? view.isolated.includes(key) : !view.hidden.includes(key)
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
  exploded: false,
  explodeAmount: 0.6,
  explodeShown: 0,
  setExploded: (exploded) => set({ exploded }),
  setExplodeAmount: (explodeAmount) => set({ explodeAmount }),
  setExplodeShown: (explodeShown) => set({ explodeShown }),
  hidden: [],
  isolated: null,
  // Isolerat: dölj tar bort ur de isolerade (Shapr3D visar annars allt igen, vilket är förvirrande).
  hide: (ids) =>
    set((s) =>
      s.isolated
        ? { isolated: s.isolated.filter((x) => !ids.includes(x)) }
        : { hidden: [...new Set([...s.hidden, ...ids])] },
    ),
  isolate: (ids) => set({ isolated: ids }),
  showAll: () => set({ hidden: [], isolated: null }),
  showDims: false,
  toggleDims: () => set((s) => ({ showDims: !s.showDims })),
  penMode: false,
  setPenMode: (penMode) => set({ penMode }),
  focusMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  panelOpen: readPanelOpen(),
  togglePanel: () =>
    set((s) => {
      savePanelOpen(!s.panelOpen)
      return { panelOpen: !s.panelOpen }
    }),
}))
