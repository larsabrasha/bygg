import { useEffect } from 'react'
import { useViewStore } from '../store/viewStore'

/** Fält man skriver i, och etiketter som flyttar fokus till dem. */
const FIELD = 'input, textarea, select, [contenteditable="true"], label'

/**
 * I pennläget kan ett finger inte trycka på ett fält (t.ex. måttrutan): en
 * handflata som nuddar skärmen ska inte öppna tangentbordet. Pennan och musen
 * gör det som vanligt, och knappar går att trycka på med fingret.
 */
export function usePenFieldGuard() {
  useEffect(() => {
    const onField = (target: EventTarget | null) => target instanceof Element && target.closest(FIELD) !== null
    // Safari ger fokus när fingret lyfts (touchend, sedan click). Där stoppas det, inte när
    // fingret nuddar: då går panelen fortfarande att scrolla med ett finger som börjar på ett fält.
    // Pennan kommer också som touch, med touchType 'stylus', och släpps igenom.
    const onTouch = (e: TouchEvent) => {
      if (!useViewStore.getState().penMode || !onField(e.target)) return
      const finger = [...e.changedTouches].some((t) => (t as Touch & { touchType?: string }).touchType !== 'stylus')
      if (finger) e.preventDefault()
    }
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !useViewStore.getState().penMode || !onField(e.target)) return
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('touchend', onTouch, { capture: true, passive: false })
    document.addEventListener('pointerdown', onPointer, { capture: true })
    return () => {
      document.removeEventListener('touchend', onTouch, { capture: true })
      document.removeEventListener('pointerdown', onPointer, { capture: true })
    }
  }, [])
}
