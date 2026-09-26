import { create } from 'zustand'

export type FitTarget = 'all' | 'selection'

/** Hur delarna ritas: bara kanter, skuggade (som från början) eller med trä och miljöljus. */
export type Look = 'wireframe' | 'shaded' | 'realistic'
export const LOOKS: readonly Look[] = ['wireframe', 'shaded', 'realistic']

export interface ViewState {
  /**
   * Senaste begäran att zooma så att något syns. n ändras vid varje begäran, även till samma mål.
   * animate: kameran glider dit (Visa allt), eller hoppar dit direkt (när en modell öppnas).
   */
  fit: { target: FitTarget; n: number; animate: boolean } | null
  requestFit: (target: FitTarget, options?: { animate?: boolean }) => void
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
  /** Utseendet i 3D-vyn (inte på ritningen). Sparas per enhet. */
  look: Look
  setLook: (look: Look) => void
  /** Ritningen (sprängskiss och stycklista) visas över hela appen. Sparas inte. */
  drawing: boolean
  setDrawing: (on: boolean) => void
  /**
   * Ritningens blad på smal skärm: anpassade till skärmens bredd (man ser hela bladet,
   * inget skrollas i sidled), eller förstorade så att måtten går att läsa. Påverkar
   * inte utskriften. Sparas per enhet; anpassade från början.
   */
  drawingFit: boolean
  toggleDrawingFit: () => void
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
const LOOK_KEY = 'bygg.look'
const DRAWING_FIT_KEY = 'bygg.drawingFit'

/** Utan lagring, eller med ett okänt värde, skuggat. */
function readLook(): Look {
  try {
    const saved = localStorage.getItem(LOOK_KEY)
    return LOOKS.find((l) => l === saved) ?? 'shaded'
  } catch {
    return 'shaded'
  }
}

function saveLook(look: Look) {
  try {
    localStorage.setItem(LOOK_KEY, look)
  } catch {
    // Går inte att spara; valet gäller tills sidan laddas om.
  }
}

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

function readDrawingFit(): boolean {
  try {
    return localStorage.getItem(DRAWING_FIT_KEY) !== 'false'
  } catch {
    return true
  }
}

function saveDrawingFit(fit: boolean) {
  try {
    localStorage.setItem(DRAWING_FIT_KEY, String(fit))
  } catch {
    // Går inte att spara; valet gäller tills sidan laddas om.
  }
}

/** Kamerabegäran från knappar och kortkommandon utanför 3D-vyn. Kameran själv ligger i CameraRig. */
export const useViewStore = create<ViewState>()((set) => ({
  fit: null,
  requestFit: (target, { animate = true } = {}) => set((s) => ({ fit: { target, n: (s.fit?.n ?? 0) + 1, animate } })),
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
  look: readLook(),
  setLook: (look) => {
    saveLook(look)
    set({ look })
  },
  drawing: false,
  setDrawing: (drawing) => set({ drawing }),
  drawingFit: readDrawingFit(),
  toggleDrawingFit: () =>
    set((s) => {
      saveDrawingFit(!s.drawingFit)
      return { drawingFit: !s.drawingFit }
    }),
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
