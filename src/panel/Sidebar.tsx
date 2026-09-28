import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { useViewStore } from '../store/viewStore'
import { CutList } from './CutList'
import { Params } from './Params'
import { Properties } from './Properties'

type Tab = 'properties' | 'params' | 'cutlist'
/** Flikarnas ordning, som i flikraden och för svep åt sidorna. */
const TAB_ORDER: readonly Tab[] = ['properties', 'params', 'cutlist']

/** Samma gräns som varianten narrow i index.css. */
const NARROW = '(max-width: 720px)'

// På smal skärm markeras aktiv flik bara när bladet är öppet.
const tabClass =
  'min-h-12 flex-1 cursor-pointer border-b-2 border-transparent font-semibold text-muted aria-selected:border-accent aria-selected:text-accent narrow:group-data-[open=false]/sheet:aria-selected:border-transparent narrow:group-data-[open=false]/sheet:aria-selected:text-muted'

type Detent = 'closed' | 'half' | 'full'

const subscribeNarrow = (onChange: () => void) => {
  const mq = matchMedia(NARROW)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => matchMedia(NARROW).matches)

/**
 * Helt öppet blad: raden i griden är lika hög som halvöppet, och bladet växer uppåt över
 * 3D-vyn med negativ marginal. Så byter vyn aldrig storlek för det läget, och kameran och
 * bilden står kvar när man drar ner till halvöppet igen. lift är 3D-vyns höjd.
 */
const fullStyle = (lift: number) => ({
  height: `calc((100dvh - var(--keyboard, 0px)) * 0.5 + ${lift}px)`,
  marginTop: `${-lift}px`,
})

/**
 * Egenskaper, Parametrar och Kaplista i var sin flik.
 * Desktop: sidopanel som går att dölja (knappen i raden överst). Smal skärm: blad längst ner med ett
 * handtag överst, som i Kartor, med tre lägen: stängt, halvöppet och helt öppet (över 3D-vyn).
 * Bladet följer fingret i handtaget eller flikraden (useSheetDrag), och svep åt sidorna i
 * innehållet byter flik (useTabSwipe). En flik öppnar bladet till
 * halvöppet; ett tryck på handtaget går stängt → halvöppet → helt öppet → halvöppet. Bara en
 * dragning nedåt stänger det.
 * Halvöppet blad har fast höjd, så att 3D-vyn inte byter storlek när man byter flik. Bladet ligger
 * över det som flyter i 3D-vyn (verktygslisten, menyer), om något når ner till det.
 * Samma DOM i båda lägena; CSS väljer layout, så fältens state överlever en rotation.
 */
export function Sidebar() {
  const [tab, setTab] = useState<Tab>('properties')
  const [detent, setDetent] = useState<Detent>('closed')
  const [lift, setLift] = useState(0)
  const narrow = useNarrow()
  const panelOpen = useViewStore((s) => s.panelOpen)
  // Döljs med CSS, inte tas bort, så att fältens state finns kvar när den visas igen.
  const hidden = useViewStore((s) => s.focusMode) ? 'hidden' : panelOpen ? '' : 'hidden narrow:flex'
  const open = detent !== 'closed'
  const full = narrow && detent === 'full'
  const setSheetOpen = useViewStore((s) => s.setSheetOpen)
  // Måttrutan ger plats åt bladet (se MeasureBox).
  useEffect(() => setSheetOpen(open), [open, setSheetOpen])

  const asideRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const swipe = useTabSwipe(contentRef, TAB_ORDER, tab, setTab)
  const drag = useSheetDrag(detent, setDetent, setLift, asideRef, contentRef, swipe)

  // Helt öppet följer 3D-vyns höjd, som ändras när telefonen vrids eller tangentbordet kommer.
  // I halvöppet och helt öppet är vyn lika hög, så måttet gäller i båda.
  useEffect(() => {
    const view = asideRef.current?.parentElement?.querySelector<HTMLElement>(':scope > main')
    if (!view || !open) return
    const ro = new ResizeObserver(() => setLift(view.clientHeight))
    ro.observe(view)
    return () => ro.disconnect()
  }, [open])

  const onTab = (t: Tab) => {
    // Slutade en dragning på en flik räknas den inte som ett tryck.
    if (drag.consumeDragged()) return
    // En flik öppnar bladet men fäller aldrig ihop det; det gör en dragning.
    setTab(t)
    if (!open) drag.animateTo('half')
  }

  const tabs: [Tab, string][] = [
    ['properties', 'Egenskaper'],
    ['params', 'Parametrar'],
    ['cutlist', 'Kaplista'],
  ]

  const next: Record<Detent, Detent> = { closed: 'half', half: 'full', full: 'half' }
  const handleLabel = { closed: 'Öppna bladet', half: 'Visa hela bladet', full: 'Visa 3D-vyn' }[detent]

  return (
    <aside
      ref={asideRef}
      data-tab={tab}
      // Under en dragning visas innehållet, också när bladet dras upp från stängt.
      data-open={open || drag.dragging}
      style={full ? fullStyle(lift) : undefined}
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
        {/* Ett tryck på handtaget går till nästa läge, men stänger aldrig: det gör bara en dragning nedåt. */}
        <button
          aria-label={handleLabel}
          onClick={() => !drag.consumeDragged() && drag.animateTo(next[detent])}
          className="hidden h-5 w-full cursor-pointer items-end justify-center narrow:flex"
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

/** Så nära skärmens kant (px) börjar inget svep: där går Safari bakåt och framåt med svep. */
const EDGE = 24
/** Så långt (andel av bredden) eller så fort (px/ms) ett svep ska gå för att byta flik. */
const SWIPE_SHARE = 0.25
const SWIPE_SPEED = 0.35
/** Där ett svep inte får börja: fält att skriva i, och det som själv tar emot svep. */
const NO_SWIPE = 'input, textarea, select, [contenteditable], [data-no-swipe]'

/** Får en gest som börjar på target (vid x) bli ett svep mellan flikarna? */
function swipeAllowed(target: EventTarget | null, container: HTMLElement, x: number): boolean {
  if (x < EDGE || x > window.innerWidth - EDGE) return false
  if (!(target instanceof Element) || target.closest(NO_SWIPE)) return false
  // Något som scrollar i sidled (en bred tabell) ska få svepet själv.
  for (let n: Element | null = target; n && n !== container; n = n.parentElement) {
    const o = getComputedStyle(n).overflowX
    if ((o === 'auto' || o === 'scroll') && n.scrollWidth > n.clientWidth + 1) return false
  }
  return true
}

interface TabSwipe {
  /** Fingret har rört sig dx px i sidled sedan svepet började. */
  move(dx: number): void
  /** Fingret släppte efter dx px, med farten v px/ms (positiv åt höger). */
  end(dx: number, v: number): void
  cancel(): void
}

/**
 * Svep åt sidorna i bladets innehåll byter flik, som sidor i iOS: innehållet följer fingret,
 * och släpper man efter en fjärdedel av bredden (eller med fart) glider det ut och nästa
 * flik glider in. Vid första och sista fliken tar det emot, som ett gummiband.
 */
function useTabSwipe(
  contentRef: RefObject<HTMLElement | null>,
  tabs: readonly Tab[],
  tab: Tab,
  setTab: (t: Tab) => void,
): TabSwipe {
  const busy = useRef(false)
  const index = tabs.indexOf(tab)
  const slide = (x: number, ms: number) => {
    const el = contentRef.current
    if (!el) return
    el.style.transition = ms ? `transform ${ms}ms ${SETTLE_EASE}` : 'none'
    el.style.transform = x ? `translateX(${x}px)` : ''
  }
  const back = () => {
    slide(0, 220)
    setTimeout(() => {
      const el = contentRef.current
      if (el && !busy.current) el.style.transition = ''
    }, 220)
  }
  return {
    move(dx) {
      if (busy.current) return
      const atEnd = (dx > 0 && index === 0) || (dx < 0 && index === tabs.length - 1)
      slide(atEnd ? band(dx, 0, 0) : dx, 0)
    },
    end(dx, v) {
      const el = contentRef.current
      if (!el || busy.current) return
      const dir = dx < 0 ? 1 : -1
      const target = tabs[index + dir]
      const fast = Math.abs(v) > SWIPE_SPEED && Math.sign(v) === Math.sign(dx)
      if (!target || !(Math.abs(dx) > el.clientWidth * SWIPE_SHARE || fast)) return back()
      busy.current = true
      const width = el.clientWidth
      slide(-dir * width, 160)
      setTimeout(() => {
        flushSync(() => setTab(target))
        // Nästa flik kommer in från andra sidan, en bit bort, och glider på plats.
        slide(dir * width * 0.3, 0)
        el.getBoundingClientRect()
        slide(0, 220)
        setTimeout(() => {
          el.style.transition = ''
          busy.current = false
        }, 220)
      }, 160)
    },
    cancel: back,
  }
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
 * till stängt, halvöppet eller helt öppet när man släpper, dit farten och läget pekar. Tryck
 * (handtaget, flikarna) glider likadant via animateTo. På bred skärm byts läget direkt.
 *
 * Under rörelsen ligger bladet över 3D-vyn (negativ marginal uppåt, så att radens höjd i
 * griden står still): vyn byter storlek en gång, när bladet har landat, och inte i varje bildruta.
 * Efter en dragning kan ett click komma på knappen där den slutade; consumeDragged säger att det
 * ska ignoreras.
 */
function useSheetDrag(
  detent: Detent,
  setDetent: (d: Detent) => void,
  setLift: (px: number) => void,
  asideRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  swipe: TabSwipe,
) {
  const [moving, setMoving] = useState(false)
  const drag = useRef<{
    y: number
    moved: boolean
    start: number
    base: number
    stops: Record<Detent, number>
    h: number
    samples: { y: number; t: number }[]
  } | null>(null)
  const dragged = useRef(false)
  const settling = useRef(false)

  /**
   * Bladets höjd nu, radens höjd i griden (base) och höjden i varje läge. Stängt: flikraden
   * och handtaget. Halvöppet: hälften av appens höjd, som i CSS:en. Helt öppet: allt under
   * raden överst, alltså ända upp över 3D-vyn.
   */
  const measure = () => {
    const el = asideRef.current!
    const app = el.parentElement!
    const view = app.querySelector<HTMLElement>(':scope > main')
    const now = el.offsetHeight
    const base = now + parseFloat(getComputedStyle(el).marginTop || '0')
    const closed = detent === 'closed' ? now : now - (contentRef.current?.offsetHeight ?? 0)
    const half = app.clientHeight * 0.5
    const full = app.getBoundingClientRect().bottom - (view ?? app).getBoundingClientRect().top
    return { now, base, stops: { closed, half, full } }
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
  /** Glid till läget to, och lämna sedan över till dess vanliga stil. */
  const settle = (stops: Record<Detent, number>, base: number, to: Detent) => {
    settling.current = true
    place(stops[to], base, true)
    setTimeout(() => {
      const lift = stops.full - stops.half
      // Läget byts och stilen tas bort i samma bildruta, så att bladet inte hoppar.
      flushSync(() => {
        if (to === 'full') setLift(lift)
        setDetent(to)
        setMoving(false)
      })
      const el = asideRef.current
      if (el) {
        el.style.transition = ''
        // Helt öppet behåller sin stil (fullStyle), samma som React sätter.
        const style = to === 'full' ? fullStyle(lift) : { height: '', marginTop: '' }
        el.style.height = style.height
        el.style.marginTop = style.marginTop
      }
      settling.current = false
    }, SETTLE_MS)
  }

  /** En dragning börjar vid y. moving: fingret rör sig redan (övertagen scroll), ingen tröskel. */
  const startAt = (y: number, moving: boolean) => {
    if (!asideRef.current || settling.current || !matchMedia(NARROW).matches) return false
    const { now, base, stops } = measure()
    drag.current = { y, moved: moving, start: now, base, stops, h: now, samples: [] }
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
    d.h = band(d.start - (y - d.y), d.stops.closed, d.stops.full)
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
    const detents: Detent[] = ['closed', 'half', 'full']
    const to = detents.reduce((a, b) => (Math.abs(projected - d.stops[b]) < Math.abs(projected - d.stops[a]) ? b : a))
    settle(d.stops, d.base, to)
  }
  const cancel = () => {
    const d = drag.current
    drag.current = null
    if (d?.moved) settle(d.stops, d.base, detent)
  }

  // Innehållet: scrollar man upp till toppen och fortsätter nedåt tar bladet över, som i iOS.
  // Pekarhändelser räcker inte: när webbläsaren scrollar kommer pointercancel. Touchhändelser
  // kan stoppa scrollen med preventDefault, så länge de är cancelable (i början av en gest,
  // och i vissa webbläsare också mitt i). Annars tar bladet över i nästa gest från toppen.
  const latest = useRef({ startAt, moveTo, finish, cancel, detent, swipe })
  useEffect(() => {
    latest.current = { startAt, moveTo, finish, cancel, detent, swipe }
  })
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    let x0 = 0
    let y0 = 0
    let mode: 'undecided' | 'scroll' | 'sheet' | 'swipe' = 'scroll'
    let last = { y: 0, t: 0 }
    // Svep i sidled byter flik. Bara om gesten får bli ett svep (swipeAllowed), och bara om
    // den första rörelsen är mest i sidled; sedan hör hela gesten till svepet.
    let canSwipe = false
    let firstMove = true
    let sx0 = 0
    let swipeSamples: { x: number; t: number }[] = []
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      mode = e.touches.length === 1 && t ? 'undecided' : 'scroll'
      if (t) [x0, y0, sx0] = [t.clientX, t.clientY, t.clientX]
      canSwipe = !!t && e.touches.length === 1 && swipeAllowed(e.target, el, t.clientX)
      firstMove = true
      swipeSamples = []
    }
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t || mode === 'scroll') return
      if (mode === 'swipe') {
        e.preventDefault()
        swipeSamples.push({ x: t.clientX, t: e.timeStamp })
        while (swipeSamples.length > 2 && e.timeStamp - swipeSamples[0]!.t > 100) swipeSamples.shift()
        latest.current.swipe.move(t.clientX - sx0)
        return
      }
      if (mode === 'sheet') {
        e.preventDefault()
        last = { y: t.clientY, t: e.timeStamp }
        latest.current.moveTo(t.clientY, e.timeStamp)
        return
      }
      const dy = t.clientY - y0
      const dx = t.clientX - x0
      if (Math.abs(dy) < DRAG_SLOP && Math.abs(dx) < DRAG_SLOP) return
      if (firstMove) {
        firstMove = false
        if (canSwipe && Math.abs(dx) > Math.abs(dy) * 1.2 && e.cancelable) {
          e.preventDefault()
          mode = 'swipe'
          swipeSamples = [{ x: t.clientX, t: e.timeStamp }]
          latest.current.swipe.move(t.clientX - sx0)
          return
        }
      }
      // Överst, nedåt och mest lodrätt: bladet. Uppåt i ett blad som inte är helt öppet: också
      // bladet, som växer först, som i iOS. Annars är det en vanlig scroll resten av gesten,
      // men den kan bli bladet senare om den når toppen (y0 flyttas med, så vi mäter därifrån).
      const vertical = Math.abs(dy) > Math.abs(dx)
      const down = el.scrollTop <= 0 && dy > 0
      const up = dy < 0 && latest.current.detent !== 'full'
      if (vertical && (down || up) && e.cancelable && latest.current.startAt(t.clientY, true)) {
        e.preventDefault()
        mode = 'sheet'
        last = { y: t.clientY, t: e.timeStamp }
      } else if (el.scrollTop > 0 || dy < 0 || Math.abs(dx) > Math.abs(dy)) {
        ;[x0, y0] = [t.clientX, t.clientY]
      }
    }
    const onEnd = () => {
      if (mode === 'sheet') latest.current.finish(last.y, last.t)
      if (mode === 'swipe') {
        const a = swipeSamples[0]
        const b = swipeSamples.at(-1)
        const v = a && b && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0
        latest.current.swipe.end((b?.x ?? sx0) - sx0, v)
      }
      mode = 'scroll'
    }
    const onCancel = () => {
      if (mode === 'sheet') latest.current.cancel()
      if (mode === 'swipe') latest.current.swipe.cancel()
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
    animateTo(to: Detent) {
      const el = asideRef.current
      if (!el || settling.current || to === detent || !matchMedia(NARROW).matches) {
        if (!settling.current) setDetent(to)
        return
      }
      const { now, base, stops } = measure()
      setMoving(true)
      place(now, base, false)
      el.getBoundingClientRect() // Startläget ritas innan övergången börjar.
      requestAnimationFrame(() => settle(stops, base, to))
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
