import { DevUI } from '@iwer/devui'
import { metaQuest3, XRDevice } from 'iwer'

declare global {
  interface Window {
    /** Emulatorn, för webbläsartester: de flyttar kontrollerna och trycker på knapparna. */
    __xrDevice?: XRDevice
  }
}

/**
 * Ett låtsas-headset med kontroller (IWER), bara i dev. Styrs med panelen som
 * visas i webbläsaren. Installeras också över en inbyggd WebXR som saknar
 * headset: Chrome på en Mac har navigator.xr men kan inte visa VR, och då
 * hoppar IWER annars över sig själv.
 */
export function installEmulator() {
  const device = new XRDevice(metaQuest3)
  device.installRuntime({ forceInstall: true })
  // ?xrtest: utan panelen, så att webbläsartester kan styra kontrollerna. Panelen skriver
  // annars över deras läge varje bildruta.
  if (!new URLSearchParams(location.search).has('xrtest')) device.installDevUI(DevUI)
  window.__xrDevice = device
}
