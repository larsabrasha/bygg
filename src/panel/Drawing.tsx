import { Printer, RotateCcw, RotateCw, X } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildCutList, groupByMaterial, type CutList, type CutListRow } from '../model/cutlist'
import { compactNames } from '../model/cutlistExport'
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
import { usePrintStore } from '../store/printStore'
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

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

/** Ritningen, när den är öppen. */
export function Drawing() {
  const open = useViewStore((s) => s.drawing)
  return open ? <DrawingView /> : null
}

/**
 * Ritning som en sammanställningsritning: sprängskissen med positionsnummer,
 * stycklistan med alla mått och en titelruta. Sedan huvudvyerna med yttermåtten
 * (MainViewsSheet), och efter dem ett detaljblad per
 * position (PartSheet), med delen i tre vyer och måtten för hål och tappar. På bred skärm och i utskrift ett
 * liggande A4-blad; storlekarna följer bladets bredd (cqw), så att det ser
 * likadant ut på skärmen som på papperet. På smal skärm står bild, lista och
 * titelruta under varandra. Fasta färger: bladet är vitt också i mörkt tema.
 */
function DrawingView() {
  const bodies = useBodies()
  const amount = useViewStore((s) => s.explodeAmount)
  const setAmount = useViewStore((s) => s.setExplodeAmount)
  const close = () => useViewStore.getState().setDrawing(false)
  const name = useLibraryStore((s) => s.currentName) || 'Modell'
  const printing = usePrintStore((s) => s.what) === 'drawing'

  // Inte rakt på hörnet (45°): där hamnar främre och bakre ben i linje och skymmer varandra.
  // Vridningen går ett kvarts varv, så att man ser möbeln från vart och ett av hörnen.
  const [azimuth, setAzimuth] = useState(START_AZIMUTH)
  const [layout, setLayout] = useState<DrawingLayout | null>(null)
  const [snapshots, setSnapshots] = useState<Partial<Record<View, string>>>({})
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

  /** Bilderna kopieras till <img>: en WebGL-canvas kommer inte med på papperet i alla webbläsare. */
  const print = async () => {
    setSnapshots({
      exploded: canvases.current.exploded?.toDataURL('image/png'),
      assembled: canvases.current.assembled?.toDataURL('image/png'),
    })
    usePrintStore.getState().setPrint('drawing')
    const previous = document.title
    document.title = `${name.replace(/[\\/:*?"<>|]/g, '').trim()} – ritning`
    window.addEventListener(
      'afterprint',
      () => {
        document.title = previous
        usePrintStore.getState().setPrint('none')
      },
      { once: true },
    )
    await nextFrame()
    window.print()
  }

  // Esc stänger; ⌘P skriver ut som knappen, så att bilderna hinner kopieras (webbläsarens egen utskrift gör inte det).
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
    <div
      role="dialog"
      aria-label="Ritning"
      className={`fixed inset-0 z-40 flex flex-col bg-canvas ${printing ? 'print:static print:block print:bg-white' : 'print:hidden'}`}
    >
      {printing && <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>}

      <div className="flex h-14 flex-none items-center gap-1 border-b border-line bg-panel px-2 pt-[env(safe-area-inset-top)] print:hidden">
        <Tip label="Stäng ritningen" keys="Esc">
          <button className={iconButton} aria-label="Stäng ritningen" onClick={close}>
            <X {...ICON} />
          </button>
        </Tip>
        {/* På smal skärm behövs platsen till knapparna; rubriken finns kvar för skärmläsare. */}
        <h2 className="pl-1 text-[15px] font-semibold narrow:sr-only">Ritning</h2>
        <div className="flex-1" />
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
        <button className={primaryButton} disabled={empty} onClick={() => void print()}>
          <Printer size={16} strokeWidth={1.75} aria-hidden />
          <span className="narrow:hidden">Skriv ut / PDF</span>
          <span className="hidden narrow:inline">PDF</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 narrow:p-3 print:overflow-visible print:p-0">
        {shots.length > 0 && <OrthoRenderer parts={parts} shots={shots} onImages={setMainImages} />}
        <div className="flex flex-col items-center gap-4 print:block">
          <Sheet responsive last={false}>
            <div className="h-full p-[1.4cqw] text-[0.95cqw] leading-tight narrow:p-2 narrow:text-[13px]">
              <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_35%] border-[0.18em] border-black narrow:grid-cols-1">
                <div className="relative min-h-0 border-r-[0.12em] border-black narrow:aspect-[4/3] narrow:border-r-0 narrow:border-b-[0.12em]">
                  {empty ? (
                    <p className="absolute inset-0 grid place-items-center text-neutral-500">Inga delar att rita</p>
                  ) : (
                    <Picture
                      label="Sprängskiss, ej skalenlig"
                      snapshot={snapshots.exploded}
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
                        snapshot={snapshots.assembled}
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
            <Sheet last={false}>
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
            <Sheet key={row.key} last={false}>
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
          <Sheet responsive last>
            <CutListSheet
              cutList={cutList}
              positions={positions}
              name={name}
              date={date}
              sheet={`${sheets} (${sheets})`}
            />
          </Sheet>
        </div>
      </div>
    </div>
  )
}

/**
 * Ett liggande A4-blad. På skärmen så stort att det ryms i höjden. På smal skärm
 * blir ett responsive blad en vanlig kolumn; de andra behåller sin form och är
 * bredare än skärmen, så att man skrollar i sidled i stället för att måtten blir oläsliga.
 *
 * Utskrift: på liggande papper 267 mm brett (A4 minus marginalerna), eller
 * smalare om skrivarens marginaler är större, hellre än att det klipps. Safari
 * på iPad skriver ut stående fast @page ber om liggande; då vrids bladet ett
 * kvarts varv och står i full storlek, så att skalan på detaljbladen stämmer.
 * Sidan bryts efter varje blad utom det sista.
 */
function Sheet({ responsive = false, last, children }: { responsive?: boolean; last: boolean; children: ReactNode }) {
  return (
    <div
      className={`flex-none print-landscape:w-full print-portrait:relative print-portrait:h-[267mm] print-portrait:w-[185mm] ${
        last ? '' : 'print:break-after-page'
      } ${responsive ? 'narrow:w-full' : 'narrow:self-start'} w-[min(100%,calc((100dvh-6rem)*267/185))]`}
    >
      <div
        className={`@container aspect-[267/185] w-full rounded-sm bg-white text-black shadow-lg print:rounded-none print:shadow-none print-landscape:max-w-[267mm] print-portrait:absolute print-portrait:top-0 print-portrait:left-0 print-portrait:h-[185mm] print-portrait:w-[267mm] print-portrait:origin-top-left print-portrait:translate-x-[185mm] print-portrait:rotate-90 ${
          responsive ? 'narrow:aspect-auto' : 'narrow:w-[900px] narrow:max-w-none'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * En bild på bladet med sin rubrik. På skärmen canvasen, i utskriften en kopia
 * av den (snapshot). Det som står ovanpå (ballongerna) ritas i båda.
 */
function Picture({
  label,
  canvas,
  snapshot,
  children,
}: {
  label: string
  canvas: ReactNode
  snapshot?: string
  children?: ReactNode
}) {
  return (
    <>
      <div className="absolute inset-0 print:hidden">{canvas}</div>
      {snapshot && (
        <img src={snapshot} alt="" className="absolute inset-0 hidden size-full object-contain print:block" />
      )}
      {children}
      <p className="pointer-events-none absolute top-[0.6em] left-[0.8em] text-[0.8em] tracking-wider text-neutral-500 uppercase">
        {label}
      </p>
    </>
  )
}

/**
 * Positionsnumren i ringar, med en linje till delen och en prick på den.
 * viewBox i bildens pixlar: i utskriften skalas ringarna med bilden (object-contain och meet centrerar lika).
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
        <thead className="text-[0.78em] tracking-wide text-neutral-600 uppercase">
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
                {row.round && <span className="text-neutral-600"> (Ø {num.format(row.round.diameter)})</span>}
              </td>
              <td className="text-right">{num.format(row.length)}</td>
              <td className="text-right">{num.format(row.width)}</td>
              <td className="text-right">{num.format(row.thickness)}</td>
              <td>{capitalize(row.material)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`${cell} text-[0.8em] text-neutral-600`}>Mått i mm. L längs fibern, T tjocklek.</p>
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
      <span className="text-[0.72em] tracking-wide text-neutral-500 uppercase">{label}</span>
      <span className="truncate">{children}</span>
    </div>
  )
}

/**
 * Kaplistan som sista blad: ämnen att kapa per material, med en ruta att bocka
 * av vid sågen. En rad är ett ämne, oavsett hål och tappar; Pos säger vilka
 * positioner i stycklistan raden gäller, eftersom de två räknar olika.
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
  const posList = (row: CutListRow) =>
    [...new Set(row.bodyIds.flatMap((id) => posOf.get(id) ?? []))].sort((a, b) => a - b).join(', ')
  return (
    <div className="h-full p-[1.4cqw] text-[0.95cqw] leading-tight narrow:p-2 narrow:text-[13px]">
      <div className="flex h-full min-h-0 flex-col border-[0.18em] border-black">
        <div className="min-h-0 flex-1 overflow-hidden px-[1em] pt-[0.8em] pb-[1em]">
          <p className="text-[0.8em] tracking-wider text-neutral-500 uppercase">Kaplista</p>
          <p className="mt-[0.3em] mb-[0.8em] text-[0.85em] text-neutral-600">
            Ämnen att kapa, i mm. L längs fibern, T tjocklek. Delar med samma ämne står på en rad även om hålen skiljer;
            Pos är positionerna i stycklistan.
          </p>
          <table className="w-full border-collapse tabular-nums">
            <thead className="text-[0.78em] tracking-wide text-neutral-600 uppercase">
              <tr className="border-b border-black/40 [&_th]:px-[0.5em] [&_th]:py-[0.4em] [&_th]:font-semibold">
                <th className="w-[2.5em]" aria-label="Kapad" />
                <th className="w-[4em] text-right">Antal</th>
                <th className="text-left">Benämning</th>
                <th className="w-[5em] text-right">L</th>
                <th className="w-[5em] text-right">B</th>
                <th className="w-[4em] text-right">T</th>
                <th className="w-[7em] text-left">Pos</th>
              </tr>
            </thead>
            {groupByMaterial(cutList.rows).map((g) => (
              <tbody key={g.material}>
                <tr className="border-b border-black/40">
                  <td colSpan={7} className="px-[0.5em] pt-[0.9em] pb-[0.4em]">
                    <span className="font-semibold">{capitalize(g.material)}</span>
                    <span className="float-right text-neutral-600">
                      {g.count} st · {volume.format(g.volumeM3)} m³
                    </span>
                  </td>
                </tr>
                {g.rows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-black/15 align-baseline [&_td]:px-[0.5em] [&_td]:py-[0.4em]"
                  >
                    <td>
                      {/* Tom ruta att bocka av i verkstaden. */}
                      <span className="block size-[1.1em] border border-black" />
                    </td>
                    <td className="text-right font-semibold">{row.count}</td>
                    <td>
                      {compactNames(row.names)}
                      {row.round && <span className="text-neutral-600"> (Ø {num.format(row.round.diameter)})</span>}
                    </td>
                    <td className="text-right">{num.format(row.length)}</td>
                    <td className="text-right">{num.format(row.width)}</td>
                    <td className="text-right">{num.format(row.thickness)}</td>
                    <td>{posList(row)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <div className="ml-auto w-[35%] border-l-[0.12em] border-black narrow:w-full narrow:border-l-0">
          <TitleBlock
            name={name}
            content="Kaplista"
            date={date}
            sheet={sheet}
            fields={[
              ['Antal delar', cutList.totalCount],
              ['Volym', `${volume.format(cutList.totalVolumeM3)} m³`],
            ]}
          />
        </div>
      </div>
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
