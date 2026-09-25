import { useCallback, useRef } from 'react'
import { registerCover } from '../scene/dimensionLabels'

/**
 * Ref för en knapprad eller ruta ovanpå 3D-vyn: måttetiketterna ställer sig
 * inte under den (se DimensionGuides).
 */
export function useCoversView<T extends HTMLElement>() {
  const current = useRef<T | null>(null)
  return useCallback((el: T | null) => {
    registerCover(el, current.current)
    current.current = el
  }, [])
}
