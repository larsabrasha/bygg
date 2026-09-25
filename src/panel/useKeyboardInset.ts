import { useEffect } from 'react'
import { keyboardInset } from './keyboardInset'

/**
 * Håller CSS-variabeln --keyboard (px) lika med hur mycket tangentbordet täcker
 * (se keyboardInset). Appen blir så mycket lägre, så att måttrutan och bladet
 * längst ner hamnar ovanför tangentbordet och man ser vad man skriver.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const update = () => {
      // Inzoomad sida (bör inte gå, se usePreventPageZoom): då är den synliga delen mindre av
      // zoomen, inte av ett tangentbord.
      const kb = Math.abs(vv.scale - 1) > 0.01 ? 0 : keyboardInset(window.innerHeight, vv.height)
      root.style.setProperty('--keyboard', `${kb}px`)
      // Safari skjuter upp sidan för att visa fältet; när appen redan är lägre behövs inte det,
      // och annars hamnar raden överst utanför skärmen.
      if (kb > 0 && window.scrollY !== 0) window.scrollTo(0, 0)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--keyboard')
    }
  }, [])
}
