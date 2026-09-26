import { Check, Circle, Delete, MousePointer2, Move, Ruler, Square, X, type LucideIcon } from 'lucide-react'
import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { MenuIcon } from './menuLayout'

/** Samma ikoner som verktygsraden (ToolButtons) och sifferblocket (Numpad) i 3D-vyn. */
const ICONS: Record<MenuIcon, LucideIcon> = {
  select: MousePointer2,
  rect: Square,
  circle: Circle,
  move: Move,
  measure: Ruler,
  back: Delete,
  ok: Check,
  cancel: X,
}

const images = new Map<string, Promise<HTMLImageElement>>()

/**
 * Ikonen som bild, att rita på en canvas (VR-menyns knappar). Komponenten från
 * lucide renderas till SVG en gång per ikon och färg, så att den ser ut exakt
 * som i 3D-vyn. Anropas inte under en rendering: flushSync renderar direkt.
 */
export function iconImage(icon: MenuIcon, color: string): Promise<HTMLImageElement> {
  const key = `${icon} ${color}`
  let image = images.get(key)
  if (!image) {
    const div = document.createElement('div')
    const root = createRoot(div)
    flushSync(() => root.render(createElement(ICONS[icon], { size: 96, strokeWidth: 1.75, color })))
    const svg = div.innerHTML
    root.unmount()
    image = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    })
    images.set(key, image)
  }
  return image
}
