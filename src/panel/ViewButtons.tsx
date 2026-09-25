import {
  Box,
  Boxes,
  Cuboid,
  Eye,
  House,
  Maximize2,
  Minimize2,
  RulerDimensionLine,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { MenuItem } from './MenuItem'
import { useDismiss } from './useDismiss'
import { LOOKS, useViewStore, type Look } from '../store/viewStore'
import { setExploded } from '../tools/actions'
import { Tip } from './Tip'
import { useCoversView } from './useCoversView'

/**
 * Knappar ovanpå 3D-vyn för kameran. Uppe till höger, så att de inte krockar med måttfältet på mobil.
 * Visa allt har text på desktop, så att den inte ser ut som fullskärm; på smal skärm bara huset.
 * Till höger om den: utseendet (V), måtten (D), sprängskissen (E) och fokusläget (Tab), bara 3D-vyn.
 * Knapparna behövs där det inte finns något tangentbord. På smal skärm ligger de i menyn Vy under Visa allt (ViewMenu).
 */
export function ViewButtons() {
  const requestFit = useViewStore((s) => s.requestFit)
  const focusMode = useViewStore((s) => s.focusMode)
  const toggleFocusMode = useViewStore((s) => s.toggleFocusMode)
  const exploded = useViewStore((s) => s.exploded)
  const showDims = useViewStore((s) => s.showDims)
  const toggleDims = useViewStore((s) => s.toggleDims)
  const FocusIcon = focusMode ? Minimize2 : Maximize2
  const cover = useCoversView<HTMLDivElement>()
  return (
    <div ref={cover} className="absolute top-3 right-3 flex gap-1 narrow:flex-col">
      <Tip label="Visa hela modellen" keys="⇧Z">
        <button
          aria-label="Visa allt"
          onClick={() => requestFit('all')}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-panel/95 px-2.5 text-[13px] font-medium shadow-md hover:bg-hover narrow:size-11 narrow:justify-center narrow:px-0"
        >
          <House size={18} strokeWidth={1.75} aria-hidden />
          <span className="narrow:hidden">Visa allt</span>
        </button>
      </Tip>
      {/* På smal skärm i en meny (ViewMenu): två kolumner med knappar får inte plats när bladet är öppet. */}
      <div className="flex gap-1 narrow:hidden">
        <LookMenu />
        <Tip label={showDims ? 'Dölj måtten' : 'Visa längd, bredd och tjocklek på det valda'} keys="D">
          <button
            aria-label="Mått"
            aria-pressed={showDims}
            onClick={toggleDims}
            className="grid size-9 cursor-pointer place-items-center rounded-lg bg-panel/95 shadow-md hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:text-accent narrow:size-11"
          >
            <RulerDimensionLine size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </Tip>
        <Tip label={exploded ? 'Stäng sprängskissen' : 'Sprängskiss: delarna isär'} keys="E">
          <button
            aria-label="Sprängskiss"
            aria-pressed={exploded}
            onClick={() => setExploded(!exploded)}
            className="grid size-9 cursor-pointer place-items-center rounded-lg bg-panel/95 shadow-md hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:text-accent narrow:size-11"
          >
            <Boxes size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </Tip>
        <Tip label={focusMode ? 'Visa panelerna igen' : 'Fokusläge: bara 3D-vyn'} keys="Tab">
          <button
            aria-label={focusMode ? 'Avsluta fokusläge' : 'Fokusläge'}
            aria-pressed={focusMode}
            onClick={toggleFocusMode}
            className="grid size-9 cursor-pointer place-items-center rounded-lg bg-panel/95 shadow-md hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:text-accent narrow:size-11"
          >
            <FocusIcon size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </Tip>
      </div>
      <ViewMenu />
    </div>
  )
}

/** Utseendena med namn och ikon, i den ordning V går igenom dem. */
const LOOK_INFO: Record<Look, { label: string; Icon: LucideIcon }> = {
  wireframe: { label: 'Trådmodell', Icon: Box },
  shaded: { label: 'Skuggad', Icon: Cuboid },
  realistic: { label: 'Realistisk', Icon: Sparkles },
}

/** Utseendet: knappen visar det valda, menyn de tre. */
function LookMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  const look = useViewStore((s) => s.look)
  const setLook = useViewStore((s) => s.setLook)
  const { Icon, label } = LOOK_INFO[look]
  return (
    <div ref={ref} className="relative">
      <Tip label={`Utseende: ${label}`} keys="V">
        <button
          aria-label="Utseende"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="grid size-9 cursor-pointer place-items-center rounded-lg bg-panel/95 shadow-md hover:bg-hover aria-expanded:bg-accent-soft aria-expanded:text-accent"
        >
          <Icon size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </Tip>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-max min-w-44 rounded-lg border border-line bg-panel p-1 shadow-lg">
          {LOOKS.map((l) => (
            <MenuItem
              key={l}
              Icon={LOOK_INFO[l].Icon}
              checked={l === look}
              onClick={() => {
                close()
                setLook(l)
              }}
            >
              {LOOK_INFO[l].label}
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Mått, sprängskiss, fokusläge och utseende på smal skärm: en knapp med en meny, så att
 * kameraknapparna och verktygslisten får plats ovanför varandra vid högerkanten
 * också när vyn är låg (bladet öppet).
 */
function ViewMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  const focusMode = useViewStore((s) => s.focusMode)
  const toggleFocusMode = useViewStore((s) => s.toggleFocusMode)
  const exploded = useViewStore((s) => s.exploded)
  const showDims = useViewStore((s) => s.showDims)
  const toggleDims = useViewStore((s) => s.toggleDims)
  const look = useViewStore((s) => s.look)
  const setLook = useViewStore((s) => s.setLook)
  const pick = (fn: () => void) => () => {
    close()
    fn()
  }
  return (
    <div ref={ref} className="relative hidden narrow:block">
      <button
        aria-label="Vy"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-11 cursor-pointer place-items-center rounded-lg bg-panel/95 shadow-md hover:bg-hover aria-expanded:bg-accent-soft aria-expanded:text-accent"
      >
        <Eye size={18} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <div className="absolute top-0 right-full z-50 mr-1 w-max min-w-44 rounded-lg border border-line bg-panel p-1 shadow-lg">
          <MenuItem Icon={RulerDimensionLine} checked={showDims} onClick={pick(toggleDims)}>
            Mått
          </MenuItem>
          <MenuItem Icon={Boxes} checked={exploded} onClick={pick(() => setExploded(!exploded))}>
            Sprängskiss
          </MenuItem>
          <MenuItem Icon={focusMode ? Minimize2 : Maximize2} checked={focusMode} onClick={pick(toggleFocusMode)}>
            Fokusläge
          </MenuItem>
          <div role="separator" className="mx-2 my-1 h-px bg-line" />
          {LOOKS.map((l) => (
            <MenuItem key={l} Icon={LOOK_INFO[l].Icon} checked={l === look} onClick={pick(() => setLook(l))}>
              {LOOK_INFO[l].label}
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  )
}
