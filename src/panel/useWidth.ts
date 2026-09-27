import { useEffect, useState, type RefObject } from 'react'

/** Elementets bredd i px, uppdaterad när den ändras (panelen dras, telefonen vrids). 0 innan den mätts. */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}
