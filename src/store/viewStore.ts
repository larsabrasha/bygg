import { create } from 'zustand'

export type FitTarget = 'all' | 'selection'

interface ViewState {
  /** Senaste begäran att zooma så att något syns. n ändras vid varje begäran, även till samma mål. */
  fit: { target: FitTarget; n: number } | null
  requestFit: (target: FitTarget) => void
}

/** Kamerabegäran från knappar och kortkommandon utanför 3D-vyn. Kameran själv ligger i CameraRig. */
export const useViewStore = create<ViewState>()((set) => ({
  fit: null,
  requestFit: (target) => set((s) => ({ fit: { target, n: (s.fit?.n ?? 0) + 1 } })),
}))
