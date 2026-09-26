import { FileDown, Printer, RotateCcw, RotateCw, Share, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildCutList, groupByMaterial, type CutList, type CutListRow } from '../model/cutlist'
import { compactNames, compactNumbers } from '../model/cutlistExport'
import { overallSize } from '../model/drawing'
import { layoutMainViews, MAIN_VIEW_CAMERA, type MainView } from '../model/mainViews'
import { canonicalGeometry, drawingPositions, partGeometry } from '../model/partSheet'
import { explodeOffsets } from '../model/explode'
import { numberFormat } from '../model/numberFormat'
import type { Vec3 } from '../model/types'
import { DrawingCanvas, type DrawingLayout } from '../scene/DrawingCanvas'
import { OrthoRenderer, type OrthoShot } from '../scene/OrthoRenderer'
import { useBodies } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { useViewStore } from '../store/viewStore'
import { MainViewsSheet } from './MainViewsSheet'
import { PartSheet } from './PartSheet'
import { Tip } from './Tip'
import { iconButton, ICON, primaryButton } from './ui'

const num = numberFormat(1, true)
const volume = numberFormat(4, true)

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('sv') + s.slice(1)

type View = 'exploded' | 'assembled'

/** Snett framifrån höger, i grader runt den lodräta axeln. */
const START_AZIMUTH = 30

/** Upplösningen i huvudvyernas bilder: pixlar per mm på papperet (8 ≈ 200 dpi). */
const PX_PER_MM = 8

/** Den hopsatta modellen: inget flyttat. */
const ASSEMBLED = new Map<string, Vec3>()

/**
 * Pekskärm: PDF:en delas (dela-menyn har också Skriv ut och Spara i Filer); annars
 * laddas den ner, och Skriv ut skriver ut den direkt.
 */
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
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
 * Ritning som en sammanställningsritning: sprängskissen med positionsnummer,
 * stycklistan med alla mått och en titelruta. Sedan huvudvyerna med yttermåtten
 * (MainViewsSheet), och efter dem ett detaljblad per
 * position (PartSheet), med delen i tre vyer och måtten för hål och tappar, och sist
 * kaplistan. På bred skärm ett liggande A4-blad; storlekarna följer bladets bredd
 * (cqw). På smal skärm står bild, lista och titelruta under varandra. Fasta färger:
 * bladet är vitt också i mörkt tema. PDF:en och utskriften görs av drawingPdf.tsx
 * (samma sidor för båda), inte av webbläsarens utskrift av sidan.
 */
function DrawingView() {
  const bodies = useBodies()
  const amount = useViewStore((s) => s.explodeAmount)
  const setAmount = useViewStore((s) => s.setExplodeAmount)
  const close = () => useViewStore.getState().setDrawing(false)
  const fit = useViewStore((s) => s.drawingFit)
  const toggleFit = useViewStore((s) => s.toggleDrawingFit)
  const name = useLibraryStore((s) => s.currentName) || 'Modell'

  // Inte rakt på hörnet (45°): där hamnar främre och bakre ben i linje och skymmer varandra.
  // Vridningen går ett kvarts varv, så att man ser möbeln från vart och ett av hörnen.
  const [azimuth, setAzimuth] = useState(START_AZIMUTH)
  const [layout, setLayout] = useState<DrawingLayout | null>(null)
  const canvases = useRef<Partial<Record<View, HTMLCanvasElement>>>({})

  // Samma arrayer tills dokumentet eller avståndet ändras; annars räknar bilden om ballongerna i en slinga.
  const parts = useMemo(() => bodies.filter((b) => !b.tool), [bodies])
  const empty = parts.length === 0
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
  const [mainImages, setMainImages] = useState<Partial<Record<MainView, string>>>({})
  const shots = useMemo((): OrthoShot[] => {
    if (!size) return []
    const layout = layoutMainViews(size)
    return (Object.keys(layout.views) as MainView[]).map((key) => ({
      key,
      ...MAIN_VIEW_CAMERA[key],
      width: Math.round(layout.views[key].w * PX_PER_MM),
      height: Math.round(layout.views[key].h * PX_PER_MM),
      margin: layout.margin * layout.scale,
    }))
  }, [size])
  // Sammanställningen, huvudvyerna, ett detaljblad per position och sist kaplistan.
  const sheets = (size ? 2 : 1) + details.length + 1
  const date = new Date().toLocaleDateString('sv-SE')

  /**
   * PDF:en (drawingPdf.tsx). Den skapas medan man väntar; på iPhone kan trycket ha
   * "gått ut" när den är klar, och då vägrar Safari öppna dela-menyn. Då blir knappen
   * Dela PDF, och nästa tryck delar den färdiga filen. En fil som gjorts innan modellen,
   * avståndet eller vinkeln ändrades räknas inte.
   */
  const [pdf, setPdf] = useState<{ file: File; deps: readonly unknown[] } | 'busy' | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const pdfDeps = [bodies, amount, azimuth, name] as const
  const readyPdf = pdf && pdf !== 'busy' && pdf.deps.every((d, i) => d === pdfDeps[i]) ? pdf.file : null

  const deliverPdf = async (file: File, again: boolean) => {
    if (!TOUCH || !navigator.canShare?.({ files: [file] })) {
      downloadFile(file)
      setPdf(null)
      return
    }
    try {
      await navigator.share({ files: [file], title: file.name })
      setPdf(null)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setPdf(null)
      else if (!again) setPdf({ file, deps: pdfDeps })
      else {
        downloadFile(file)
        setPdf(null)
      }
    }
  }

  /** PDF:en för det som står i ritningen nu, med bilderna som de ser ut på skärmen. */
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

  /** Kör fn med knappen i läget "skapar"; ett fel visas under verktygsraden. */
  const withPdf = async (fn: () => Promise<void>) => {
    setPdf('busy')
    setPdfError(null)
    try {
      await fn()
    } catch (e) {
      console.error('[bygg] Kunde inte skapa PDF', e)
      setPdfError(e instanceof Error ? e.message : String(e))
      setPdf(null)
    }
  }

  const savePdf = () =>
    readyPdf ? deliverPdf(readyPdf, true) : withPdf(async () => deliverPdf(await buildPdfFile(), false))

  // På pekskärm går utskriften genom dela-menyn (där finns Skriv ut).
  const print = () =>
    TOUCH
      ? savePdf()
      : withPdf(async () => {
          printFile(await buildPdfFile())
          setPdf(null)
        })

  // Esc stänger; ⌘P skriver ut som knappen (PDF:en), inte sidan.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') useViewStore.getState().setDrawing(false)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault()
      if (!empty) void print()
    }
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <>
      {/* Skriver man ut sidan med webbläsarens egen utskrift blir det bara den här raden. */}
      <p className="hidden p-8 text-[12pt] text-black print:block">
        Skriv ut ritningen med Skriv ut eller PDF i ritningens verktygsrad.
      </p>
      <div role="dialog" aria-label="Ritning" className="fixed inset-0 z-40 flex flex-col bg-canvas print:hidden">
        <div className="flex h-14 flex-none items-center gap-1 border-b border-line bg-panel px-2 pt-[env(safe-area-inset-top)]">
          <Tip label="Stäng ritningen" keys="Esc">
            <button className={iconButton} aria-label="Stäng ritningen" onClick={close}>
              <X {...ICON} />
            </button>
          </Tip>
          {/* På smal skärm behövs platsen till knapparna; rubriken finns kvar för skärmläsare. */}
          <h2 className="pl-1 text-[15px] font-semibold narrow:sr-only">Ritning</h2>
          <div className="flex-1" />
          {/* Bara på smal skärm: på bred ryms bladen alltid. */}
          <span className="hidden narrow:flex">
            <Tip label={fit ? 'Förstora bladen' : 'Anpassa bladen till skärmen'}>
              <button
                className={iconButton}
                aria-label={fit ? 'Förstora bladen' : 'Anpassa bladen till skärmen'}
                onClick={toggleFit}
              >
                {fit ? <ZoomIn {...ICON} /> : <ZoomOut {...ICON} />}
              </button>
            </Tip>
          </span>
          <Tip label="Vrid åt vänster">
            <button className={iconButton} aria-label="Vrid åt vänster" onClick={() => setAzimuth((a) => a - 90)}>
              <RotateCcw {...ICON} />
            </button>
          </Tip>
          <Tip label="Vrid åt höger">
            <button className={iconButton} aria-label="Vrid åt höger" onClick={() => setAzimuth((a) => a + 90)}>
              <RotateCw {...ICON} />
            </button>
          </Tip>
          <label className="mx-2 flex items-center gap-2 text-[13px] font-medium narrow:mx-1">
            <span className="narrow:hidden">Isär</span>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label="Hur långt isär"
              className="w-28 accent-accent narrow:w-20"
            />
          </label>
          {/* Skriv ut direkt utan pekskärm; med pekskärm finns Skriv ut i dela-menyn för PDF:en. */}
          {!TOUCH && (
            <Tip label="Skriv ut" keys="⌘P">
              <button
                className={iconButton}
                aria-label="Skriv ut"
                disabled={empty || pdf === 'busy'}
                onClick={() => void print()}
              >
                <Printer {...ICON} />
              </button>
            </Tip>
          )}
          <button className={primaryButton} disabled={empty || pdf === 'busy'} onClick={() => void savePdf()}>
            {readyPdf ? (
              <Share size={16} strokeWidth={1.75} aria-hidden />
            ) : (
              <FileDown size={16} strokeWidth={1.75} aria-hidden />
            )}
            <span className="narrow:hidden">
              {pdf === 'busy' ? 'Skapar PDF…' : readyPdf ? 'Dela PDF' : 'Spara PDF'}
            </span>
            <span className="hidden narrow:inline">{pdf === 'busy' ? 'PDF…' : readyPdf ? 'Dela' : 'PDF'}</span>
          </button>
        </div>
        {pdfError && (
          <p role="alert" className="flex-none bg-panel px-3 py-1.5 text-xs text-danger">
            Kunde inte skapa PDF: {pdfError}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 narrow:p-3">
          {shots.length > 0 && <OrthoRenderer parts={parts} shots={shots} onImages={setMainImages} />}
          <div className="flex flex-col items-center gap-4">
            <Sheet responsive>
              <div className="h-full p-[1.4cqw] text-[1.1cqw] leading-tight narrow:p-2 narrow:text-[13px]">
                <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_38%] border-[0.18em] border-black narrow:grid-cols-1">
                  <div className="relative min-h-0 border-r-[0.12em] border-black narrow:aspect-[4/3] narrow:border-r-0 narrow:border-b-[0.12em]">
                    {empty ? (
                      <p className="absolute inset-0 grid place-items-center text-neutral-500">Inga delar att rita</p>
                    ) : (
                      <Picture
                        label="Sprängskiss, ej skalenlig"
                        canvas={
                          <DrawingCanvas
                            parts={parts}
                            offsets={offsets}
                            azimuth={azimuth}
                            balloons={balloons}
                            onCanvas={(c) => (canvases.current.exploded = c)}
                          />
                        }
                      >
                        {layout && <Balloons layout={layout} />}
                      </Picture>
                    )}
                  </div>

                  <div className="flex min-h-0 flex-col">
                    {/* Modellen hopsatt, i platsen över stycklistan. På smal skärm får den en egen ruta. */}
                    <div className="relative min-h-[6em] flex-1 narrow:aspect-[16/10] narrow:flex-none">
                      {!empty && (
                        <Picture
                          label="Hopsatt"
                          canvas={
                            <DrawingCanvas
                              parts={parts}
                              offsets={ASSEMBLED}
                              azimuth={azimuth}
                              onCanvas={(c) => (canvases.current.assembled = c)}
                            />
                          }
                        />
                      )}
                    </div>
                    <PartsList rows={positions} />
                    <TitleBlock
                      name={name}
                      content="Sammanställning, sprängskiss"
                      date={date}
                      sheet={`1 (${sheets})`}
                      fields={[
                        [
                          'Yttermått B × D × H',
                          size
                            ? `${num.format(size.width)} × ${num.format(size.depth)} × ${num.format(size.height)}`
                            : '–',
                        ],
                        ['Antal delar', cutList.totalCount],
                      ]}
                    />
                  </div>
                </div>
              </div>
            </Sheet>
            {size && (
              <Sheet fit={fit}>
                <MainViewsSheet
                  size={size}
                  images={mainImages}
                  modelName={name}
                  date={date}
                  count={cutList.totalCount}
                  sheet={2}
                  sheets={sheets}
                />
              </Sheet>
            )}
            {details.map(({ row, geometry }, i) => (
              <Sheet key={row.key} fit={fit}>
                <PartSheet
                  pos={i + 1}
                  row={row}
                  geometry={geometry}
                  modelName={name}
                  date={date}
                  sheet={sheets - details.length + i}
                  sheets={sheets}
                />
              </Sheet>
            ))}
            <PortraitSheet>
              <CutListSheet
                cutList={cutList}
                positions={positions}
                name={name}
                date={date}
                sheet={`${sheets} (${sheets})`}
              />
            </PortraitSheet>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Ett liggande A4-blad, 245 × 170 mm (SHEET i partSheet.ts). På skärmen så stort att det ryms i höjden. På smal skärm
 * blir ett responsive blad en vanlig kolumn; de andra behåller sin form, och är
 * antingen lika breda som skärmen (fit) eller 900 px breda, så att måtten går att
 * läsa och man skrollar i sidled (knappen i verktygsraden, drawingFit).

 */
function Sheet({
  responsive = false,
  fit = false,
  children,
}: {
  responsive?: boolean
  fit?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`flex-none ${responsive || fit ? 'narrow:w-full' : 'narrow:self-start'} w-[min(100%,calc((100dvh-6rem)*245/170))]`}
    >
      <div
        className={`@container aspect-[245/170] w-full rounded-sm bg-white text-black shadow-lg ${
          responsive ? 'narrow:aspect-auto' : fit ? '' : 'narrow:w-[900px] narrow:max-w-none'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

/** En bild på bladet med sin rubrik, och det som står ovanpå (ballongerna). */
function Picture({ label, canvas, children }: { label: string; canvas: ReactNode; children?: ReactNode }) {
  return (
    <>
      <div className="absolute inset-0">{canvas}</div>
      {children}
      <p className="pointer-events-none absolute top-[0.6em] left-[0.8em] text-[0.8em] tracking-wider text-neutral-700 uppercase">
        {label}
      </p>
    </>
  )
}

/**
 * Positionsnumren i ringar, med en linje till delen och en prick på den.
 * viewBox i bildens pixlar, så att de följer bilden (PDF:en ritar dem på samma sätt).
 */
function Balloons({ layout }: { layout: DrawingLayout }) {
  const { width, height, r, balloons } = layout
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden
      fill="none"
      stroke="black"
    >
      {balloons.map((b) => {
        const dx = b.x - b.bx
        const dy = b.y - b.by
        const d = Math.hypot(dx, dy) || 1
        return (
          <g key={b.pos}>
            <line
              x1={b.bx + (dx / d) * r}
              y1={b.by + (dy / d) * r}
              x2={b.x}
              y2={b.y}
              strokeWidth={Math.max(0.8, r * 0.07)}
            />
            <circle cx={b.x} cy={b.y} r={Math.max(1.8, r * 0.16)} fill="black" stroke="none" />
            <circle cx={b.bx} cy={b.by} r={r} fill="white" strokeWidth={Math.max(1, r * 0.09)} />
            <text
              x={b.bx}
              y={b.by}
              textAnchor="middle"
              dominantBaseline="central"
              fill="black"
              stroke="none"
              fontSize={r * 1.05}
              fontWeight={600}
            >
              {b.pos}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function PartsList({ rows }: { rows: readonly CutListRow[] }) {
  const cell = 'px-[0.5em] py-[0.35em]'
  return (
    <div className="border-t-[0.12em] border-black">
      <p className={`${cell} py-[0.5em] font-semibold`}>Stycklista</p>
      <table className="w-full border-collapse tabular-nums">
        <thead className="text-[0.8em] tracking-wide text-neutral-700 uppercase">
          <tr className="border-y border-black/40 [&_th]:px-[0.5em] [&_th]:py-[0.4em] [&_th]:font-semibold">
            <th className="text-right">Pos</th>
            <th className="text-right">Ant</th>
            <th className="text-left">Benämning</th>
            <th className="text-right">L</th>
            <th className="text-right">B</th>
            <th className="text-right">T</th>
            <th className="text-left">Material</th>
          </tr>
        </thead>
        <tbody className="[&_td]:px-[0.5em] [&_td]:py-[0.35em]">
          {rows.map((row, i) => (
            <tr key={row.key} className="border-b border-black/15 align-baseline">
              <td className="text-right font-semibold">{i + 1}</td>
              <td className="text-right">{row.count}</td>
              <td>
                {compactNames(row.names)}
                {row.round && <span className="text-neutral-700"> (Ø {num.format(row.round.diameter)})</span>}
              </td>
              <td className="text-right">{num.format(row.length)}</td>
              <td className="text-right">{num.format(row.width)}</td>
              <td className="text-right">{num.format(row.thickness)}</td>
              <td>{capitalize(row.material)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`${cell} text-[0.85em] text-neutral-700`}>Mått i mm. L längs fibern, T tjocklek.</p>
    </div>
  )
}

/** En ruta i titelrutan: liten rubrik och värdet under. first = längst till vänster; top = inte översta raden. */
function Field({
  label,
  children,
  span = '',
  first = false,
  top = true,
}: {
  label: string
  children: ReactNode
  span?: string
  first?: boolean
  top?: boolean
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-[0.15em] border-black px-[0.5em] py-[0.35em] ${span} ${first ? '' : 'border-l'} ${top ? 'border-t' : ''}`}
    >
      <span className="text-[0.78em] tracking-wide text-neutral-700 uppercase">{label}</span>
      <span className="truncate">{children}</span>
    </div>
  )
}

/**
 * Kaplistans blad: stående, och det växer med listan. På skärmen så stort att
 * det ryms i höjden, som de andra bladen.
 */
function PortraitSheet({ children }: { children: ReactNode }) {
  return (
    <div className="w-[min(100%,calc((100dvh-6rem)*177/255))] flex-none narrow:w-full">
      <div className="@container aspect-[177/255] w-full rounded-sm bg-white text-black shadow-lg narrow:aspect-auto">
        {children}
      </div>
    </div>
  )
}

/**
 * Kaplistan: ämnen att kapa per material, med en ruta att bocka av vid sågen.
 * En rad är ett ämne, oavsett hål och tappar; Pos säger vilka positioner i
 * stycklistan raden gäller, eftersom de två räknar olika. Måtten står störst,
 * det är dem man läser vid sågen.
 */
function CutListSheet({
  cutList,
  positions,
  name,
  date,
  sheet,
}: {
  cutList: CutList
  positions: readonly CutListRow[]
  name: string
  date: string
  sheet: string
}) {
  const posOf = new Map(positions.flatMap((row, i) => row.bodyIds.map((id) => [id, i + 1] as const)))
  const posList = (row: CutListRow) => compactNumbers(row.bodyIds.flatMap((id) => posOf.get(id) ?? []))
  return (
    <div className="p-[6cqw] text-[2.1cqw] leading-snug narrow:p-4 narrow:text-[14px]">
      <div className="flex items-end justify-between gap-[1em] border-b-[0.15em] border-black pb-[0.5em]">
        <div className="min-w-0">
          <p className="text-[0.8em] font-semibold tracking-wider text-neutral-700 uppercase">Kaplista</p>
          <h2 className="truncate text-[1.7em] leading-tight font-semibold">{name}</h2>
        </div>
        <div className="flex-none text-right text-[0.9em] text-neutral-800 tabular-nums">
          <p>{date}</p>
          <p>Blad {sheet}</p>
        </div>
      </div>
      <p className="mt-[0.6em] text-[0.9em] text-neutral-800">
        {cutList.totalCount} delar · {volume.format(cutList.totalVolumeM3)} m³. Mått i mm: L längs fibern, T tjocklek.
        Delar med samma ämne står på en rad även om hålen skiljer; Pos är positionerna i stycklistan.
      </p>

      {groupByMaterial(cutList.rows).map((g) => (
        <table key={g.material} className="mt-[1.4em] w-full border-collapse tabular-nums">
          <caption className="border-b-[0.12em] border-black pb-[0.3em] text-left">
            <span className="text-[1.2em] font-semibold">{capitalize(g.material)}</span>
            <span className="float-right pt-[0.25em] text-neutral-800">
              {g.count} st · {volume.format(g.volumeM3)} m³
            </span>
          </caption>
          <thead className="text-[0.8em] tracking-wide text-neutral-700 uppercase">
            <tr className="border-b border-black/40 [&_th]:py-[0.5em] [&_th]:font-semibold">
              <th className="w-[2em]" aria-label="Kapad" />
              <th className="w-[3em] pr-[0.8em] text-right">Ant</th>
              <th className="text-left">Benämning</th>
              <th className="w-[4.2em] text-right">L</th>
              <th className="w-[4.2em] text-right">B</th>
              <th className="w-[3.4em] text-right">T</th>
              <th className="w-[6em] pl-[1em] text-left">Pos</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((row) => (
              <tr
                key={row.key}
                className="break-inside-avoid border-b border-black/25 align-baseline [&_td]:py-[0.55em]"
              >
                <td>
                  {/* Tom ruta att bocka av i verkstaden. */}
                  <span className="block size-[1.1em] translate-y-[0.15em] border-[0.1em] border-black" />
                </td>
                <td className="pr-[0.8em] text-right font-semibold">{row.count}</td>
                <td className="pr-[0.5em]">
                  {compactNames(row.names)}
                  {row.round && <span className="text-neutral-700"> (Ø {num.format(row.round.diameter)})</span>}
                </td>
                <td className="text-right text-[1.1em] font-semibold">{num.format(row.length)}</td>
                <td className="text-right text-[1.1em] font-semibold">{num.format(row.width)}</td>
                <td className="text-right text-[1.1em] font-semibold">{num.format(row.thickness)}</td>
                <td className="pl-[1em] text-neutral-800">{posList(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  )
}

/** Titelrutan på ett HTML-blad: benämning, innehåll, datum, två fält för bladet och bladnumret. */
function TitleBlock({
  name,
  content,
  date,
  sheet,
  fields,
}: {
  name: string
  content: string
  date: string
  sheet: string
  fields: [[string, ReactNode], [string, ReactNode]]
}) {
  return (
    <div className="grid grid-cols-3 border-t-[0.12em] border-black">
      <Field label="Benämning" span="col-span-3" first top={false}>
        <span className="text-[1.45em] font-semibold">{name}</span>
      </Field>
      <Field label="Innehåll" span="col-span-2" first>
        {content}
      </Field>
      <Field label="Datum">{date}</Field>
      <Field label={fields[0][0]} first>
        {fields[0][1]}
      </Field>
      <Field label={fields[1][0]}>{fields[1][1]}</Field>
      <Field label="Blad">{sheet}</Field>
    </div>
  )
}
