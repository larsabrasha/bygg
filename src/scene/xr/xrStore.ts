import { createXRStore, type XRStore } from '@react-three/xr'
import { useStore } from 'zustand'

/**
 * VR med WebXR (i Chrome eller Edge på PC med SteamVR, eller i ett headsets
 * egen webbläsare). Handkontrollerna läses av VrRig; biblioteket ritar bara
 * deras modeller. Händer och bibliotekets strålar används inte.
 *
 * Utan headset i dev startas en emulator (se emulator.ts), så att VR går att
 * prova utan headset.
 */
function create(): XRStore {
  return createXRStore({
    // Bibliotekets egen emulator hoppar över sig själv när webbläsaren har WebXR utan headset.
    emulate: false,
    // Ingen fråga från webbläsaren om att gå in i VR; det gör VR-knappen i vyn (VrButton).
    offerSession: false,
    // Kontrollerna ritas, så att man ser var händerna är, men utan bibliotekets strålar och grepp.
    // Modellerna kommer från WebXR Input Profiles (MIT) på nätet och cachas av service workern.
    // PS VR2 via SteamVR anger ingen profil, och får den generiska modellen med spak och grepp.
    controller: { model: true, rayPointer: false, grabPointer: false, teleportPointer: false },
    defaultControllerProfileId: 'generic-trigger-squeeze-thumbstick',
    hand: false,
    transientPointer: false,
    gaze: false,
    screenInput: false,
  })
}

// Samma store efter en hot reload: annars tappar en pågående VR-session sin koppling till scenen.
export const xrStore: XRStore = import.meta.hot?.data.xrStore ?? create()
if (import.meta.hot) import.meta.hot.data.xrStore = xrStore

/**
 * Sant om VR går att starta. Kollas en gång, när appen startar. I dev installeras
 * emulatorn först om webbläsaren saknar VR, så att svaret då alltid är sant.
 */
export const vrAvailable: Promise<boolean> = import.meta.hot?.data.vrAvailable ?? checkVr()
if (import.meta.hot) import.meta.hot.data.vrAvailable = vrAvailable

async function checkVr(): Promise<boolean> {
  if (await vrSupported()) return true
  if (!import.meta.env.DEV) return false
  ;(await import('./emulator')).installEmulator()
  return true
}

declare global {
  interface Window {
    __xr?: XRStore
  }
}
// Bara i dev: webbläsartester startar VR härifrån.
if (import.meta.env.DEV) window.__xr = xrStore

/** Sant under en VR-session. Fungerar också utanför Canvas. */
export function useInVr(): boolean {
  return useStore(xrStore, (s) => s.session != null)
}

/** Sant om webbläsaren kan visa VR (eller emulatorn körs). */
async function vrSupported(): Promise<boolean> {
  try {
    return (await navigator.xr?.isSessionSupported('immersive-vr')) ?? false
  } catch {
    return false
  }
}
