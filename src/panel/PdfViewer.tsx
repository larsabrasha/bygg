import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdfjs } from './pdfjs'
import { DrawingBar } from './DrawingBar'

/**
 * PDF:en visad i appen, alla sidor under varandra: likadant på alla enheter och
 * också i den installerade appen, där webbläsarens egen PDF-visare inte alltid
 * går att nå. pdf.js (pdfjs.ts) laddas med visaren, som laddas när ritningen öppnas.
 *
 * Sidorna ritas bara när de syns (eller nästan syns), och töms när man skrollat
 * långt bort: en ritning med många blad blev annars för mycket minne på en telefon.
 *
 * Zoom: nyp med två fingrar (kring punkten mellan fingrarna), dubbeltryck eller
 * knapparna. Appen stänger av webbläsarens egen nypzoom (usePreventPageZoom), så
 * visaren läser fingrarna själv: under nypet skalas sidorna med CSS, och när man
 * släpper ritas de om i den nya storleken. Inzoomat går det att panorera med
 * musen genom att dra i vyn (handen som pekare); finger och penna skrollar själva.
 */

/** Zoom, där 1 = sidorna så breda som skärmen (högst MAX_WIDTH). */
const MIN_ZOOM = 1
const MAX_ZOOM = 10
const STEP = 1.5
/** Dubbeltryck växlar mellan hela sidan och så här nära. */
const TAP_ZOOM = 2.5
const MAX_WIDTH = 1100
/**
 * En canvas får inte vara större än så här på iPhone (antal pixlar och sida). Långt
 * inzoomat blir sidan då lite mjukare, men några sidor på en gång ryms i minnet.
 */
const MAX_CANVAS_AREA = 12_000_000
const MAX_CANVAS_SIDE = 4096

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
const GAP = 16
/** Hur länge visaren väntar på att de första sidorna ritats innan den visar dem ändå. */
const SHOW_ANYWAY_MS = 10_000

/** En punkt på en sida (läget i den, 0–1) och var i visarens ruta den ska stå. */
interface Anchor {
  page: number
  rx: number
  ry: number
  cx: number
  cy: number
}

interface Props {
  file: File
  onClose: () => void
  onPrint: () => void
  /** Dela (pekskärm) eller ladda ner (dator), med ikon och text. */
  share: { label: string; icon: ReactNode; onClick: () => void }
  /** Det som visas medan PDF:en läses, innan första sidan kan ritas. */
  loading: ReactNode
}

export default function PdfViewer({ file, onClose, onPrint, share, loading }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState<{ w: number; h: number }[]>([])
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [width, setWidth] = useState(0)
  // Sidorna visas först när de som ritas från början är klara; till dess står förloppet kvar.
  // Annars syns vita sidor en stund (på en telefon flera sekunder).
  const [shown, setShown] = useState(false)
  const rendering = useRef(0)
  const busy = useCallback(() => {
    rendering.current++
    let done = false
    return () => {
      if (done) return
      done = true
      if (--rendering.current === 0) setShown(true)
    }
  }, [])
  // Skyddsnät: börjar ingen sida ritas (bredden okänd) visas sidorna ändå efter en stund.
  useEffect(() => {
    if (!doc || shown) return
    const t = setTimeout(() => setShown(true), SHOW_ANYWAY_MS)
    return () => clearTimeout(t)
  }, [doc, shown])
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  /** Punkten som ska stå still när sidorna ritats i den nya storleken. */
  const scrollTo = useRef<Anchor | null>(null)
  /** Var musen och skrollen var när man började dra i vyn. */
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const endPan = () => {
    pan.current = null
    setPanning(false)
  }

  /**
   * Punkten på sidorna under (cx, cy) i visarens ruta: vilken sida och var på den.
   * Efter zoomen skrollas så att samma punkt står på samma ställe. Räknas på sidan
   * själv, inte på hela innehållet: mellanrummen och marginalen växer inte med zoomen,
   * så en skalning av allt hamnade lite fel (det hoppade när man släppte ett nyp).
   * Måste räknas utan CSS-skalning på sidorna (före ett nyp).
   */
  const anchorAt = (cx: number, cy: number): Anchor | null => {
    const el = scroller.current
    const box = content.current
    if (!el || !box) return null
    const r = el.getBoundingClientRect()
    const x = r.left + cx
    const y = r.top + cy
    const kids = [...box.children]
    // Sidan under punkten, annars den närmaste i höjdled (mellan två sidor).
    let best = 0
    let bestD = Infinity
    kids.forEach((k, i) => {
      const b = k.getBoundingClientRect()
      const d = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    const b = kids[best]?.getBoundingClientRect()
    return b ? { page: best, rx: (x - b.left) / b.width, ry: (y - b.top) / b.height, cx, cy } : null
  }

  const zoomTo = (z: number, anchor: Anchor | null) => {
    const next = clampZoom(z)
    if (next === zoom || !anchor) return
    scrollTo.current = anchor
    setZoom(next)
  }
  const zoomCentered = (z: number) => {
    const el = scroller.current
    if (el) zoomTo(z, anchorAt(el.clientWidth / 2, el.clientHeight / 2))
  }
  useLayoutEffect(() => {
    const el = scroller.current
    const a = scrollTo.current
    const page = content.current?.children[a?.page ?? -1]
    if (!el || !a || !page) return
    scrollTo.current = null
    const b = page.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    el.scrollLeft += b.left + a.rx * b.width - (r.left + a.cx)
    el.scrollTop += b.top + a.ry * b.height - (r.top + a.cy)
  }, [zoom])

  // Nyp med två fingrar. Ett finger skrollar som vanligt.
  const currentZoom = useEffectEvent(() => zoom)
  const anchor = useEffectEvent(anchorAt)
  const pinched = useEffectEvent(zoomTo)
  useEffect(() => {
    const el = scroller.current
    const box = content.current
    if (!el || !box) return
    let start: { d: number; z: number; anchor: Anchor | null } | null = null
    let f = 1
    const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY)
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      const r = el.getBoundingClientRect()
      const mx = (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2 - r.left
      const my = (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2 - r.top
      start = { d: dist(e.touches) || 1, z: currentZoom(), anchor: anchor(mx, my) }
      f = 1
      // Skrollen står still under nypet: annars kan Safari skrolla vidare med det första
      // fingret, och då stämmer inte punkten när man släpper.
      el.style.overflow = 'hidden'
      box.style.transformOrigin = `${el.scrollLeft + mx}px ${el.scrollTop + my}px`
    }
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return
      e.preventDefault()
      f = clampZoom((start.z * dist(e.touches)) / start.d) / start.z
      box.style.transform = `scale(${f})`
    }
    const onEnd = (e: TouchEvent) => {
      if (!start || e.touches.length >= 2) return
      box.style.transform = ''
      el.style.overflow = ''
      pinched(start.z * f, start.anchor)
      start = null
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [doc])

  useEffect(() => {
    let live = true
    let task: { destroy: () => Promise<void> } | null = null
    void (async () => {
      try {
        const lib = await loadPdfjs()
        const loading = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
        task = loading
        const pdf = await loading.promise
        const sizes = await Promise.all(
          Array.from({ length: pdf.numPages }, async (_, i) => {
            const vp = (await pdf.getPage(i + 1)).getViewport({ scale: 1 })
            return { w: vp.width, h: vp.height }
          }),
        )
        if (!live) return
        setPages(sizes)
        setDoc(pdf)
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      live = false
      void task?.destroy()
    }
  }, [file])

  // Tillgänglig bredd; sidorna ritas om när den ändras (vridning, fönstrets storlek).
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Esc stänger visaren (inte ritningen bakom); ⌘P skriver ut; ⇧Z visar hela sidan (samma tangent som Visa allt i 3D-vyn).
  // Fångas före ritningens lyssnare.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    } else if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      e.stopPropagation()
      zoomCentered(MIN_ZOOM)
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault()
      e.stopPropagation()
      onPrint()
    }
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [])

  // Samma skala på alla sidor (punkter → CSS-pixlar), så att en stående sida blir smalare än en liggande.
  const widest = Math.max(1, ...pages.map((p) => p.w))
  const scale = (Math.min(MAX_WIDTH, Math.max(0, width - 2 * GAP)) / widest) * zoom

  return (
    <div role="dialog" aria-label="Ritning" className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <DrawingBar
        onClose={onClose}
        onZoomOut={zoom > MIN_ZOOM ? () => zoomCentered(zoom / STEP) : undefined}
        onZoomIn={zoom < MAX_ZOOM ? () => zoomCentered(zoom * STEP) : undefined}
        zoom={zoom}
        onZoomReset={zoom > MIN_ZOOM ? () => zoomCentered(MIN_ZOOM) : undefined}
        share={share}
        onPrint={onPrint}
      />
      <div
        ref={scroller}
        className={`relative min-h-0 flex-1 overflow-auto overscroll-contain ${
          zoom > MIN_ZOOM ? `select-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}` : ''
        }`}
        // Musen: dra i vyn för att panorera när man zoomat in. Inte på rullningslisterna,
        // som ska gå att dra i som vanligt.
        onPointerDown={(e) => {
          const el = e.currentTarget
          const r = el.getBoundingClientRect()
          const onBar = e.clientX - r.left >= el.clientWidth || e.clientY - r.top >= el.clientHeight
          if (e.pointerType !== 'mouse' || e.button !== 0 || zoom <= MIN_ZOOM || onBar) return
          e.preventDefault()
          el.setPointerCapture(e.pointerId)
          pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
          setPanning(true)
        }}
        onPointerMove={(e) => {
          const p = pan.current
          if (!p) return
          e.currentTarget.scrollLeft = p.left - (e.clientX - p.x)
          e.currentTarget.scrollTop = p.top - (e.clientY - p.y)
        }}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onLostPointerCapture={endPan}
        // Dubbeltryck (dubbelklick): närmare där man tryckte, eller tillbaka till hela sidan.
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          zoomTo(zoom > MIN_ZOOM ? MIN_ZOOM : TAP_ZOOM, anchorAt(e.clientX - r.left, e.clientY - r.top))
        }}
      >
        {error ? (
          <p className="p-6 text-sm text-danger">Kunde inte visa ritningen: {error}</p>
        ) : (
          <>
            {!shown && (
              // Samma förlopp som medan PDF:en skapas (Drawing): för den som tittar är det ett och samma steg.
              <div className="absolute inset-0 flex items-center justify-center p-6 text-sm text-ink/70">{loading}</div>
            )}
            {doc && (
              // Osynliga men på sin plats medan de ritas: de som syns från början ska ritas då.
              <div
                ref={content}
                className={`flex w-max min-w-full flex-col items-center ${shown ? '' : 'invisible'}`}
                style={{ gap: GAP, padding: GAP }}
              >
                {pages.map((p, i) => (
                  <Page
                    key={i}
                    doc={doc}
                    index={i}
                    width={p.w * scale}
                    height={p.h * scale}
                    root={scroller}
                    busy={shown ? undefined : busy}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** En sida: ritas när den kommer nära skärmen, töms när den är långt borta. */
function Page({
  doc,
  index,
  width,
  height,
  root,
  busy,
}: {
  doc: PDFDocumentProxy
  index: number
  width: number
  height: number
  root: React.RefObject<HTMLDivElement | null>
  /** Säger att sidan ritas; ger tillbaka en funktion att anropa när den är klar (eller avbruten). */
  busy?: () => () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setNear(!!entry?.isIntersecting), {
      root: root.current,
      rootMargin: '150% 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [root])

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    if (!near || width < 1) {
      // Tömd: en canvas utan pixlar tar inget minne.
      c.width = 0
      c.height = 0
      return
    }
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null
    let live = true
    // Redan innan sidan hämtats, så att visaren inte tror att allt är klart när första sidan är det.
    const done = busy?.()
    void (async () => {
      const page = await doc.getPage(index + 1).catch(() => null)
      if (!live || !page) return done?.()
      // Högst 2 pixlar per CSS-pixel: skarpt nog, och en telefon med 3× får annars slut på minne.
      // Inzoomat hålls canvasen under iPhones största tillåtna storlek.
      const dpr = Math.min(
        2,
        window.devicePixelRatio || 1,
        MAX_CANVAS_SIDE / width,
        MAX_CANVAS_SIDE / height,
        Math.sqrt(MAX_CANVAS_AREA / (width * height)),
      )
      const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * dpr })
      c.width = Math.floor(viewport.width)
      c.height = Math.floor(viewport.height)
      task = page.render({ canvas: c, viewport })
      await task.promise.catch(() => {})
      done?.()
    })()
    return () => {
      live = false
      task?.cancel()
      done?.()
    }
    // busy följer inte med: den byts (mot undefined) när sidorna visas, och då ska inget ritas om.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, index, near, width, height])

  return (
    <div ref={box} className="flex-none bg-white shadow-lg" style={{ width, height }}>
      <canvas ref={canvas} className="block size-full" aria-label={`Sida ${index + 1}`} />
    </div>
  )
}
