import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { useViewStore } from '../store/viewStore'
import { CutList } from './CutList'
import { Params } from './Params'
import { Properties } from './Properties'

type Tab = 'properties' | 'params' | 'cutlist'

/** Samma gräns som varianten narrow i index.css. */
const NARROW = '(max-width: 720px)'

// På smal skärm markeras aktiv flik bara när bladet är öppet.
const tabClass =
  'min-h-12 flex-1 cursor-pointer border-b-2 border-transparent font-semibold text-muted aria-selected:border-accent aria-selected:text-accent narrow:group-data-[open=false]/sheet:aria-selected:border-transparent narrow:group-data-[open=false]/sheet:aria-selected:text-muted'

/**
 * Egenskaper, Parametrar och Kaplista i var sin flik.
 * Desktop: sidopanel som går att dölja (knappen i raden överst). Smal skärm: blad längst ner med ett
 * handtag överst, som i Kartor: bladet följer fingret i handtaget eller flikraden (useSheetDrag).
 * Ett tryck på handtaget eller en flik öppnar bladet, men fäller aldrig ihop det: det gör bara
 * en dragning nedåt.
 * Öppet blad har fast höjd, så att 3D-vyn inte byter storlek när man byter flik. Bladet ligger
 * över det som flyter i 3D-vyn (verktygslisten, menyer), om något når ner till det.
 * Samma DOM i båda lägena; CSS väljer layout, så fältens state överlever en rotation.
 */
export function Sidebar() {
  const [tab, setTab] = useState<Tab>('properties')
  const [open, setOpen] = useState(false)
  const panelOpen = useViewStore((s) => s.panelOpen)
  // Döljs med CSS, inte tas bort, så att fältens state finns kvar när den visas igen.
  const hidden = useViewStore((s) => s.focusMode) ? 'hidden' : panelOpen ? '' : 'hidden narrow:flex'

  const asideRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const drag = useSheetDrag(open, setOpen, asideRef, contentRef)

  const onTab = (t: Tab) => {
    // Slutade en dragning på en flik räknas den inte som ett tryck.
    if (drag.consumeDragged()) return
    // En flik öppnar bladet men fäller aldrig ihop det; det gör handtaget eller en dragning.
    setTab(t)
    drag.animateTo(true)
  }

  const tabs: [Tab, string][] = [
    ['properties', 'Egenskaper'],
    ['params', 'Parametrar'],
    ['cutlist', 'Kaplista'],
  ]

  return (
    <aside
      ref={asideRef}
      data-tab={tab}
      // Under en dragning visas innehållet, också när bladet dras upp från stängt.
      data-open={open || drag.dragging}
      className={`group/sheet flex flex-col ${hidden} overflow-hidden border-l border-line bg-panel [grid-area:sidebar]
        narrow:relative narrow:z-10 narrow:data-[open=true]:h-[calc((100dvh-var(--keyboard,0px))*0.5)] narrow:rounded-t-xl narrow:border-t narrow:border-l-0
        narrow:pb-[env(safe-area-inset-bottom)] narrow:shadow-[0_-2px_12px_rgb(0_0_0/8%)]`}
    >
      {/* Handtaget och flikraden tar emot dragningen, inte innehållet: där krockar den aldrig med scroll. */}
      <div
        className="flex-none narrow:touch-none"
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
      >
        {/* Ett tryck på handtaget öppnar, men fäller inte ihop: det gör bara en dragning nedåt. */}
        <button
          aria-label="Öppna bladet"
          aria-hidden={open}
          tabIndex={open ? -1 : 0}
          onClick={() => !drag.consumeDragged() && !open && drag.animateTo(true)}
          className="hidden h-5 w-full items-end justify-center narrow:flex narrow:group-data-[open=false]/sheet:cursor-pointer"
        >
          <span className="h-1.5 w-9 rounded-full bg-line" />
        </button>
        <div className="flex border-b border-line narrow:border-b-0" role="tablist">
          {tabs.map(([t, label]) => (
            <button key={t} role="tab" className={tabClass} aria-selected={tab === t} onClick={() => onTab(t)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={contentRef}
        className="flex flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain p-4 narrow:group-data-[open=false]/sheet:hidden"
      >
        <Properties />
        <Params />
        <CutList />
      </div>
    </aside>
  )
}

/** Så långt (px) fingret ska röra sig innan det räknas som en dragning och inte ett tryck. */
const DRAG_SLOP = 8
/** Hur långt fram (ms) farten räknas när man släpper: ett snabbt svep byter läge fast det är kort. */
const PROJECT_MS = 180
/** Hur länge bladet glider till sitt läge, och kurvan: den som iOS-blad har (snabb start, lång inbromsning). */
const SETTLE_MS = 420
const SETTLE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
/** Längst (px) bladet går förbi stängt eller halvöppet när man drar vidare, som ett gummiband. */
const RUBBER = 36

/** Gummiband: förbi gränsen rör sig bladet allt mindre, högst RUBBER px. */
function band(raw: number, min: number, max: number) {
  const rub = (over: number) => RUBBER * (1 - Math.exp(-over / (RUBBER * 2)))
  if (raw > max) return max + rub(raw - max)
  if (raw < min) return min - rub(min - raw)
  return raw
}

/**
 * Bladet på smal skärm: följer fingret när man drar i handtaget eller flikraden, och glider
 * till stängt eller halvöppet när man släpper, dit farten och läget pekar. Tryck (handtaget,
 * flikarna) glider likadant via animateTo. På bred skärm byts läget direkt.
 *
 * Under rörelsen ligger bladet över 3D-vyn (negativ marginal uppåt, så att radens höjd i
 * griden står still): vyn byter storlek en gång, när bladet har landat, och inte i varje bildruta.
 * Efter en dragning kan ett click komma på knappen där den slutade; consumeDragged säger att det
 * ska ignoreras.
 */
function useSheetDrag(
  open: boolean,
  setOpen: (open: boolean) => void,
  asideRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
) {
  const [moving, setMoving] = useState(false)
  const drag = useRef<{
    y: number
    moved: boolean
    base: number
    min: number
    max: number
    h: number
    samples: { y: number; t: number }[]
  } | null>(null)
  const dragged = useRef(false)
  const settling = useRef(false)

  /** Radens höjd nu, och bladets höjd stängt och halvöppet. */
  const measure = () => {
    const el = asideRef.current!
    const base = el.offsetHeight
    // Stängt: flikraden och handtaget. Halvöppet: hälften av appens höjd, som i CSS:en.
    const min = open ? base - (contentRef.current?.offsetHeight ?? 0) : base
    const max = open ? base : (el.parentElement?.clientHeight ?? window.innerHeight) * 0.5
    return { base, min, max }
  }
  /** Bladets höjd h, med radens höjd base oförändrad. */
  const place = (h: number, base: number, animate: boolean) => {
    const el = asideRef.current
    if (!el) return
    el.style.transition = animate
      ? `height ${SETTLE_MS}ms ${SETTLE_EASE}, margin-top ${SETTLE_MS}ms ${SETTLE_EASE}`
      : 'none'
    el.style.height = `${h}px`
    el.style.marginTop = `${base - h}px`
  }
  /** Glid till target (px), och lämna sedan över till det vanliga läget. */
  const settle = (target: number, base: number, toOpen: boolean) => {
    settling.current = true
    place(target, base, true)
    setTimeout(() => {
      // Läget byts och stilen tas bort i samma bildruta, så att bladet inte hoppar.
      flushSync(() => {
        setOpen(toOpen)
        setMoving(false)
      })
      const el = asideRef.current
      if (el) el.style.transition = el.style.height = el.style.marginTop = ''
      settling.current = false
    }, SETTLE_MS)
  }

  /** En dragning börjar vid y. moving: fingret rör sig redan (övertagen scroll), ingen tröskel. */
  const startAt = (y: number, moving: boolean) => {
    if (!asideRef.current || settling.current || !matchMedia(NARROW).matches) return false
    const { base, min, max } = measure()
    drag.current = { y, moved: moving, base, min, max, h: base, samples: [] }
    dragged.current = false
    if (moving) setMoving(true)
    return true
  }
  const moveTo = (y: number, t: number) => {
    const d = drag.current
    if (!d) return
    if (!d.moved) {
      d.moved = true
      setMoving(true)
    }
    d.samples.push({ y, t })
    while (d.samples.length > 2 && t - d.samples[0]!.t > 100) d.samples.shift()
    d.h = band(d.base - (y - d.y), d.min, d.max)
    place(d.h, d.base, false)
  }
  /** Fingret släpper vid y: fart i px/ms (positiv nedåt) de sista 100 ms; läget dit den pekar avgör. */
  const finish = (y: number, t: number) => {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    const first = d.samples[0]
    const v = first && t > first.t ? (y - first.y) / (t - first.t) : 0
    const projected = d.h - v * PROJECT_MS
    const toOpen = Math.abs(projected - d.max) < Math.abs(projected - d.min)
    settle(toOpen ? d.max : d.min, d.base, toOpen)
  }
  const cancel = () => {
    const d = drag.current
    drag.current = null
    if (d?.moved) settle(open ? d.max : d.min, d.base, open)
  }

  // Innehållet: scrollar man upp till toppen och fortsätter nedåt tar bladet över, som i iOS.
  // Pekarhändelser räcker inte: när webbläsaren scrollar kommer pointercancel. Touchhändelser
  // kan stoppa scrollen med preventDefault, så länge de är cancelable (i början av en gest,
  // och i vissa webbläsare också mitt i). Annars tar bladet över i nästa gest från toppen.
  const latest = useRef({ startAt, moveTo, finish, cancel })
  useEffect(() => {
    latest.current = { startAt, moveTo, finish, cancel }
  })
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    let x0 = 0
    let y0 = 0
    let mode: 'undecided' | 'scroll' | 'sheet' = 'scroll'
    let last = { y: 0, t: 0 }
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      mode = e.touches.length === 1 && t ? 'undecided' : 'scroll'
      if (t) [x0, y0] = [t.clientX, t.clientY]
    }
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t || mode === 'scroll') return
      if (mode === 'sheet') {
        e.preventDefault()
        last = { y: t.clientY, t: e.timeStamp }
        latest.current.moveTo(t.clientY, e.timeStamp)
        return
      }
      const dy = t.clientY - y0
      const dx = t.clientX - x0
      if (Math.abs(dy) < DRAG_SLOP && Math.abs(dx) < DRAG_SLOP) return
      // Överst, nedåt och mest lodrätt: bladet. Annars är det en vanlig scroll resten av gesten,
      // men den kan bli bladet senare om den når toppen (y0 flyttas med, så vi mäter därifrån).
      if (el.scrollTop <= 0 && dy > 0 && dy > Math.abs(dx) && e.cancelable && latest.current.startAt(t.clientY, true)) {
        e.preventDefault()
        mode = 'sheet'
        last = { y: t.clientY, t: e.timeStamp }
      } else if (el.scrollTop > 0 || dy < 0 || Math.abs(dx) > Math.abs(dy)) {
        ;[x0, y0] = [t.clientX, t.clientY]
      }
    }
    const onEnd = () => {
      if (mode === 'sheet') latest.current.finish(last.y, last.t)
      mode = 'scroll'
    }
    const onCancel = () => {
      if (mode === 'sheet') latest.current.cancel()
      mode = 'scroll'
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onCancel)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
  }, [contentRef])

  return {
    /** Sant medan bladet rör sig: då visas innehållet också på väg upp från stängt. */
    dragging: moving,
    animateTo(toOpen: boolean) {
      const el = asideRef.current
      if (!el || settling.current || toOpen === open || !matchMedia(NARROW).matches) {
        if (!settling.current) setOpen(toOpen)
        return
      }
      const { base, min, max } = measure()
      setMoving(true)
      place(base, base, false)
      el.getBoundingClientRect() // Startläget ritas innan övergången börjar.
      requestAnimationFrame(() => settle(toOpen ? max : min, base, toOpen))
    },
    onPointerDown(e: PointerEvent) {
      startAt(e.clientY, false)
    },
    onPointerMove(e: PointerEvent) {
      const d = drag.current
      if (!d) return
      if (!d.moved) {
        if (Math.abs(e.clientY - d.y) < DRAG_SLOP) return
        // Först nu: fångas pekaren direkt går ett vanligt tryck till raden och inte till fliken.
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      moveTo(e.clientY, e.timeStamp)
    },
    onPointerUp(e: PointerEvent) {
      if (!drag.current?.moved) {
        drag.current = null
        return
      }
      // Ett click efter dragningen kommer i samma task som pointerup, om det kommer alls
      // (med fångad pekare går det till raden). Sedan gäller flaggan inte längre.
      dragged.current = true
      setTimeout(() => (dragged.current = false))
      finish(e.clientY, e.timeStamp)
    },
    onPointerCancel: cancel,
    consumeDragged() {
      const was = dragged.current
      dragged.current = false
      return was
    },
  }
}
