import { FileDown, Loader2, Share } from 'lucide-react'
import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildCutList } from '../model/cutlist'
import { overallSize } from '../model/drawing'
import { explodeOffsets } from '../model/explode'
import { layoutMainViews, MAIN_VIEW_CAMERA, type MainView } from '../model/mainViews'
import { numberFormat } from '../model/numberFormat'
import { canonicalGeometry, drawingPositions, partGeometry } from '../model/partSheet'
import type { Vec3 } from '../model/types'
import { useManifold } from '../scene/csg'
import { DrawingCanvas, type DrawingLayout } from '../scene/DrawingCanvas'
import { OrthoRenderer, type OrthoShot } from '../scene/OrthoRenderer'
import { useBodies } from '../store/documentStore'
import { downloadFile, TOUCH } from './fileOut'
import { useLibraryStore } from '../store/libraryStore'
import { useViewStore } from '../store/viewStore'
import { MainViewsSheet } from './MainViewsSheet'
import { PartSheet } from './PartSheet'
import { DrawingBar } from './DrawingBar'
import { ICON, primaryButton } from './ui'

const num = numberFormat(1, true)

type View = 'exploded' | 'assembled'

/** Snett framifrån höger, i grader runt den lodräta axeln. Inte rakt på hörnet: där skymmer benen varandra. */
const AZIMUTH = 30

/** Upplösningen i huvudvyernas bilder: pixlar per mm på papperet (8 ≈ 200 dpi). */
const PX_PER_MM = 8

/**
 * Bildernas storlek i CSS-pixlar (canvasen får upp till 2 pixlar per CSS-pixel).
 * Ungefär samma form som rutorna de står i på sammanställningen i PDF:en.
 */
const EXPLODED_PX = { w: 900, h: 960 }
const ASSEMBLED_PX = { w: 600, h: 560 }

/** Hur länge bilderna ska stå still innan PDF:en byggs (hål och tappar kan ritas in efter hand). */
const SETTLE_MS = 400

/** Den hopsatta modellen: inget flyttat. */
const ASSEMBLED = new Map<string, Vec3>()

/** Visaren (och pdf.js) laddas först när ritningen öppnas. */
const PdfViewer = lazy(() => import('./PdfViewer'))

/**
 * PDF:en i webbläsarens egen PDF-visare i en ny flik, där den går att dela och skriva ut.
 * Reserv när dela-menyn saknas: Safari har den bara på https (inte på http i det egna
 * nätet, som i utveckling). Blockeras fliken laddas filen ner i stället.
 */
function openFile(file: File) {
  const url = URL.createObjectURL(file)
  if (!window.open(url, '_blank')) downloadFile(file)
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000)
}

/** Dela-menyn med PDF:en, eller en ny flik med den om dela-menyn inte finns. */
async function shareFile(file: File) {
  if (!navigator.canShare?.({ files: [file] })) return openFile(file)
  try {
    await navigator.share({ files: [file], title: file.name })
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) openFile(file)
  }
}

let printFrame: HTMLIFrameElement | null = null

/**
 * Skriver ut PDF:en från en osynlig ram, med webbläsarens PDF-visare: samma sidor som
 * i filen. Ramen står kvar tills nästa utskrift (dialogen läser ur den så länge den är
 * öppen). Går det inte att skriva ut från ramen öppnas PDF:en i en ny flik.
 */
function printFile(file: File) {
  if (printFrame) {
    URL.revokeObjectURL(printFrame.src)
    printFrame.remove()
  }
  const url = URL.createObjectURL(file)
  const frame = document.createElement('iframe')
  frame.title = file.name
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none'
  frame.onload = () => {
    try {
      frame.contentWindow!.focus()
      frame.contentWindow!.print()
    } catch {
      window.open(url, '_blank')
    }
  }
  frame.src = url
  document.body.appendChild(frame)
  printFrame = frame
}

/** Ritningen, när den är öppen. */
export function Drawing() {
  const open = useViewStore((s) => s.drawing)
  return open ? <DrawingView /> : null
}

/**
 * Ritningen som PDF, visad direkt i appen (PdfViewer). Sammanställningen med
 * sprängskissen, huvudvyerna, ett detaljblad per position och sist kaplistan
 * (drawingPdf.tsx). Bilderna till den ritas först, osynligt bakom visaren: sprängskissen
 * med positionsnummer, modellen hopsatt och huvudvyerna. När PDF:en är klar tas de
 * bort, så att deras grafikminne släpps. Utskrift, delning och nedladdning använder
 * samma fil, så att det blir likadant oavsett.
 */
function DrawingView() {
  const bodies = useBodies()
  const amount = useViewStore((s) => s.explodeAmount)
  const name = useLibraryStore((s) => s.currentName) || 'Modell'
  const close = () => useViewStore.getState().setDrawing(false)

  const [layout, setLayout] = useState<DrawingLayout | null>(null)
  const [mainImages, setMainImages] = useState<Partial<Record<MainView, string>>>({})
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Visaren och pdf.js laddas medan PDF:en skapas, så att den visas direkt när den är klar.
  useEffect(() => {
    void import('./PdfViewer')
    void import('./pdfjs').then((m) => m.loadPdfjs())
  }, [])
  const canvases = useRef<Partial<Record<View, HTMLCanvasElement>>>({})

  const parts = useMemo(() => bodies.filter((b) => !b.tool), [bodies])
  const offsets = useMemo(() => explodeOffsets(bodies, amount), [bodies, amount])
  const cutList = useMemo(() => buildCutList(bodies), [bodies])
  // En position per likadan del: samma ämne men olika hål eller tappar blir olika positioner.
  const positions = useMemo(() => drawingPositions(bodies), [bodies])
  const size = useMemo(() => overallSize(bodies), [bodies])
  const balloons = useMemo(() => ({ rows: positions, onLayout: setLayout }), [positions])
  const details = useMemo(() => {
    const byId = new Map(parts.map((b) => [b.id, b]))
    return positions.map((row) => ({ row, geometry: canonicalGeometry(partGeometry(byId.get(row.bodyIds[0]!)!)) }))
  }, [parts, positions])
  // Huvudvyerna: bilderna tas i en dold canvas, lika stora som de står på bladet.
  const shots = useMemo((): OrthoShot[] => {
    if (!size) return []
    const views = layoutMainViews(size)
    return (Object.keys(views.views) as MainView[]).map((key) => ({
      key,
      ...MAIN_VIEW_CAMERA[key],
      width: Math.round(views.views[key].w * PX_PER_MM),
      height: Math.round(views.views[key].h * PX_PER_MM),
      margin: views.margin * views.scale,
    }))
  }, [size])
  // Med hål och tappar väntar bilderna på manifold-3d (samma som delarna ritas med).
  const needsManifold = parts.some((b) => b.tools)
  const manifold = useManifold(needsManifold)
  // Sammanställningen, huvudvyerna, ett detaljblad per position och sist kaplistan.
  const sheets = (size ? 2 : 1) + details.length + 1
  const date = new Date().toLocaleDateString('sv-SE')

  /** PDF:en för modellen, med bilderna som de ritats. */
  const buildPdfFile = async (): Promise<File> => {
    const { buildDrawingPdf } = await import('./drawingPdf')
    const picture = (c: HTMLCanvasElement | undefined, w?: number, h?: number) =>
      c && c.width > 0 ? { url: c.toDataURL('image/png'), width: w ?? c.width, height: h ?? c.height } : undefined
    // Ballongerna ligger i bildens CSS-pixlar (layout), canvasen i skärmens pixlar: samma form.
    const exploded = picture(canvases.current.exploded, layout?.width, layout?.height)
    const blob = await buildDrawingPdf({
      name,
      date,
      sheets,
      size: size ? `${num.format(size.width)} × ${num.format(size.depth)} × ${num.format(size.height)}` : '–',
      positions,
      cutList,
      exploded: exploded && { ...exploded, layout },
      assembled: picture(canvases.current.assembled),
      svgSheets: [
        ...(size
          ? [
              <MainViewsSheet
                key="main"
                size={size}
                images={mainImages}
                modelName={name}
                date={date}
                count={cutList.totalCount}
                sheet={2}
                sheets={sheets}
              />,
            ]
          : []),
        ...details.map(({ row, geometry }, i) => (
          <PartSheet
            key={row.key}
            pos={i + 1}
            row={row}
            geometry={geometry}
            modelName={name}
            date={date}
            sheet={sheets - details.length + i}
            sheets={sheets}
          />
        )),
      ],
    })
    return new File([blob], `${name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Modell'} – ritning.pdf`, {
      type: 'application/pdf',
    })
  }

  // PDF:en byggs när bilderna finns och har stått still en stund: ballongerna är placerade,
  // huvudvyerna tagna och (med hål och tappar) manifold-3d laddad.
  const ready =
    parts.length > 0 &&
    layout !== null &&
    Object.keys(mainImages).length === shots.length &&
    (!needsManifold || manifold !== null)
  const build = useEffectEvent(buildPdfFile)
  useEffect(() => {
    if (!ready || file) return
    let live = true
    const timer = setTimeout(() => {
      build().then(
        (f) => live && setFile(f),
        (e: unknown) => {
          console.error('[bygg] Kunde inte skapa PDF', e)
          if (live) setError(e instanceof Error ? e.message : String(e))
        },
      )
    }, SETTLE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [ready, file, layout, mainImages, manifold, attempt])

  // Pekskärm: PDF:en delas (dela-menyn har Skriv ut och Spara i Filer). Annars skrivs den ut direkt och laddas ner.
  const print = (f: File) => (TOUCH ? void shareFile(f) : printFile(f))
  const share = (f: File) => (TOUCH ? void shareFile(f) : downloadFile(f))
  const ShareIcon = TOUCH ? Share : FileDown

  const shareButton = { label: TOUCH ? 'Dela PDF' : 'Ladda ner PDF', icon: <ShareIcon {...ICON} /> }
  const waiting = (
    <Waiting
      onClose={close}
      share={shareButton}
      error={error}
      onRetry={() => {
        setError(null)
        setAttempt((a) => a + 1)
      }}
    />
  )

  return (
    <>
      {/* Skriver man ut sidan med webbläsarens egen utskrift blir det bara den här raden. */}
      <p className="hidden p-8 text-[12pt] text-black print:block">
        Skriv ut ritningen med skrivarknappen i ritningen.
      </p>
      {!file && (
        // Bilderna till PDF:en, bakom visaren (som täcker hela skärmen). De måste ha en storlek och
        // ritas för att gå att kopiera, så de är inte dolda med display: none.
        <div aria-hidden className="pointer-events-none fixed top-0 left-0 -z-10 opacity-0 print:hidden">
          <div className="relative" style={{ width: EXPLODED_PX.w, height: EXPLODED_PX.h }}>
            <DrawingCanvas
              parts={parts}
              offsets={offsets}
              azimuth={AZIMUTH}
              balloons={balloons}
              onCanvas={(c) => (canvases.current.exploded = c)}
            />
          </div>
          <div className="relative" style={{ width: ASSEMBLED_PX.w, height: ASSEMBLED_PX.h }}>
            <DrawingCanvas
              parts={parts}
              offsets={ASSEMBLED}
              azimuth={AZIMUTH}
              onCanvas={(c) => (canvases.current.assembled = c)}
            />
          </div>
          {shots.length > 0 && <OrthoRenderer parts={parts} shots={shots} onImages={setMainImages} />}
        </div>
      )}
      <div className="print:hidden">
        {file ? (
          <Suspense fallback={waiting}>
            <PdfViewer
              file={file}
              onClose={close}
              onPrint={() => print(file)}
              share={{ ...shareButton, onClick: () => share(file) }}
            />
          </Suspense>
        ) : (
          waiting
        )}
      </div>
    </>
  )
}

/**
 * Medan ritningen skapas: samma verktygsrad som visaren (knapparna gråa) och en snurra,
 * eller felet och Försök igen.
 */
function Waiting({
  onClose,
  error,
  onRetry,
  share,
}: {
  onClose: () => void
  error: string | null
  onRetry: () => void
  share: { label: string; icon: ReactNode }
}) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
  return (
    <div role="dialog" aria-label="Ritning" className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <DrawingBar onClose={onClose} share={share} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-ink/70">
        {error ? (
          <>
            <p className="text-danger">Kunde inte skapa ritningen: {error}</p>
            <button className={primaryButton} onClick={onRetry}>
              Försök igen
            </button>
          </>
        ) : (
          <p className="flex items-center gap-2">
            <Loader2 size={18} className="animate-spin" aria-hidden /> Skapar ritningen…
          </p>
        )}
      </div>
    </div>
  )
}
