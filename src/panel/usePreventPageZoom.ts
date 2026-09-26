import { useEffect } from 'react'

/**
 * Sidan ska inte gå att zooma med två fingrar, bara 3D-vyn (kameran). Safari
 * bryr sig inte om user-scalable=no. Därför stoppas både Safaris egna
 * nyp-händelser (gesturestart m.fl.) och touchmove med flera fingrar utanför
 * 3D-vyn, utöver touch-action i index.css. Kameran läser pekarhändelser, som
 * inte påverkas av det.
 */
export function usePreventPageZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault()
    const events = ['gesturestart', 'gesturechange', 'gestureend'] as const
    for (const name of events) document.addEventListener(name, stop, { passive: false })
    const pinch = (e: TouchEvent) => {
      if (e.touches.length > 1 && !(e.target instanceof HTMLCanvasElement)) e.preventDefault()
    }
    document.addEventListener('touchmove', pinch, { passive: false })
    return () => {
      for (const name of events) document.removeEventListener(name, stop)
      document.removeEventListener('touchmove', pinch)
    }
  }, [])
}
