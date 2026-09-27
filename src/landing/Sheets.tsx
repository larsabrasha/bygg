import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { layoutMainViews, MAIN_VIEW_CAMERA, type MainView } from '../model/mainViews'
import { MainViewsSheet } from '../panel/MainViewsSheet'
import { PartSheet } from '../panel/PartSheet'
import type { OrthoShot } from '../scene/OrthoRenderer'
import { bord, bordCutList, bordDrawing } from './models'
import { useInView, useMedia } from './useInView'

/**
 * Riktiga blad ur ritningen av bordet, som en bunt papper: huvudvyerna och
 * två detaljblad. Bunten bläddras av sig själv medan den syns (inte för den som bett om
 * minskad rörelse), och ett tryck tar nästa blad. Bladen är appens egna (panel/MainViewsSheet och PartSheet).
 */

// Bilderna i huvudvyerna tas med three.js, som laddas först när bunten närmar sig.
const OrthoRenderer = lazy(() => import('../scene/OrthoRenderer').then((m) => ({ default: m.OrthoRenderer })))

/** Pixlar per mm på papperet, som i ritningen. */
const PX_PER_MM = 8
const NEXT_MS = 4500
/** Så länge bladet som läggs undan är på väg ut; sedan är det osynligt och kan läggas sist. */
const OUT_MS = 520

const date = new Date().toLocaleDateString('sv-SE')
const { details, size, sheets } = bordDrawing
const detail = (name: string) => details.find((d) => d.row.names.includes(name)) ?? details[0]!

const PAGES = [
  { key: 'main', label: 'Huvudvyer' },
  { key: 'Bordsben', label: 'Bordsben' },
  { key: 'Bordsslå', label: 'Bordsslå' },
] as const

/** Var ett blad ligger i bunten: 0 överst. */
const PLACE = [
  'translate(0, 0) rotate(0deg) scale(1)',
  'translate(3.5%, -4%) rotate(2.6deg) scale(0.97)',
  'translate(-3%, -7%) rotate(-3.2deg) scale(0.94)',
]
/**
 * Bladet som läggs undan: helt ut åt vänster (bort från texten, ut över sidans kant, som
 * Landing klipper), sedan sist i bunten.
 */
const OUT = 'translate(-110%, 5%) rotate(-7deg) scale(0.98)'
/**
 * Ut: kommer i gång direkt och tonar bort först när bladet är utanför bunten (annars
 * syns två ritningar genom varandra). På plats (och tillbaka längst bak, osynligt):
 * mjukt in. Bladet byter plats i bunten först när det är osynligt, så att det inte
 * hoppar bakom de andra mitt i rörelsen.
 */
const OUT_TRANSITION = `transform ${OUT_MS}ms cubic-bezier(0.4, 0, 0.6, 1), opacity 160ms linear ${OUT_MS - 160}ms`
const PLACE_TRANSITION = 'transform 600ms cubic-bezier(0.3, 0.7, 0.2, 1), opacity 400ms ease-out'
/** Tillbaka i bunten: hoppar dit medan det är osynligt och tonar in, i stället för att glida tillbaka. */
const BACK_MS = 400
const BACK_TRANSITION = `opacity ${BACK_MS}ms ease-out`

export function Sheets() {
  const [ref, near] = useInView<HTMLDivElement>(0)
  const [images, setImages] = useState<Partial<Record<MainView, string>>>({})
  const [top, setTop] = useState(0)
  const [leaving, setLeaving] = useState<number | null>(null)
  const [returning, setReturning] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  // Har man bläddrat själv bläddrar bunten inte längre av sig själv.
  const [manual, setManual] = useState(false)
  const reduced = useMedia('(prefers-reduced-motion: reduce)')

  const shots = useMemo((): OrthoShot[] => {
    const views = layoutMainViews(size)
    return (Object.keys(views.views) as MainView[]).map((key) => ({
      key,
      ...MAIN_VIEW_CAMERA[key],
      width: Math.round(views.views[key].w * PX_PER_MM),
      height: Math.round(views.views[key].h * PX_PER_MM),
      margin: views.margin * views.scale,
    }))
  }, [])

  // Nästa blad kommer upp medan det översta läggs undan. Ett val under tiden tas när det är klart.
  const current = useRef({ top: 0, busy: false, wanted: 0 })
  const goTo = (next: number) => {
    const c = current.current
    c.wanted = next
    if (c.busy || next === c.top) return
    c.busy = true
    const out = c.top
    setLeaving(out)
    setTop(next)
    c.top = next
    setTimeout(() => {
      c.busy = false
      setLeaving(null)
      setReturning(out)
      setTimeout(() => setReturning((r) => (r === out ? null : r)), BACK_MS)
      if (c.wanted !== c.top) goTo(c.wanted)
    }, OUT_MS)
  }

  useEffect(() => {
    if (!near || paused || manual || reduced) return
    const t = setTimeout(() => goTo((top + 1) % PAGES.length), NEXT_MS)
    return () => clearTimeout(t)
  })

  const page = (key: (typeof PAGES)[number]['key']) => {
    if (key === 'main')
      return (
        <MainViewsSheet
          size={size}
          images={images}
          modelName="Bord"
          date={date}
          count={bordCutList.totalCount}
          sheet={2}
          sheets={sheets}
        />
      )
    const d = detail(key)
    return (
      <PartSheet
        pos={d.pos}
        row={d.row}
        geometry={d.geometry}
        modelName="Bord"
        date={date}
        sheet={2 + d.pos}
        sheets={sheets}
      />
    )
  }

  return (
    <div ref={ref} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      {near && Object.keys(images).length === 0 && (
        <Suspense>
          <OrthoRenderer parts={bord} shots={shots} onImages={setImages} />
        </Suspense>
      )}
      <button
        className="relative block aspect-[287/200] w-full cursor-pointer"
        aria-label={`Visa nästa blad. Nu: ${PAGES[top]!.label}.`}
        onClick={() => {
          setManual(true)
          // Från det senast valda, så att snabba tryck under en bläddring inte går förlorade.
          goTo((current.current.wanted + 1) % PAGES.length)
        }}
      >
        {PAGES.map((p, i) => {
          const depth = (i - top + PAGES.length) % PAGES.length
          const out = leaving === i
          return (
            <div
              key={p.key}
              aria-hidden={depth !== 0}
              className="absolute inset-0 overflow-hidden rounded-[3px] bg-[#fdfcf9] text-left shadow-[0_1px_1px_rgba(40,25,10,0.08),0_8px_16px_-6px_rgba(40,25,10,0.18),0_36px_70px_-30px_rgba(40,25,10,0.5)] will-change-transform motion-reduce:transition-none!"
              style={{
                transform: out ? OUT : PLACE[depth],
                opacity: out ? 0 : 1,
                // Bladet som läggs undan ligger kvar överst tills det är osynligt; sedan på sin plats.
                zIndex: out ? PAGES.length + 1 : PAGES.length - depth,
                transition: out ? OUT_TRANSITION : returning === i ? BACK_TRANSITION : PLACE_TRANSITION,
              }}
            >
              {page(p.key)}
              {/* Bladen längre ner lite mörkare. En hinna i stället för filter, som målas om varje bildruta. */}
              <div
                className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-500"
                style={{ opacity: out ? 0 : depth * 0.04 }}
              />
            </div>
          )
        })}
      </button>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {PAGES.map((p, i) => (
          <button
            key={p.key}
            aria-pressed={top === i}
            onClick={() => {
              setManual(true)
              goTo(i)
            }}
            className="h-8 cursor-pointer rounded-full px-3.5 text-[12px] font-medium text-muted transition-colors hover:bg-hover aria-pressed:bg-ink aria-pressed:text-canvas"
          >
            {p.key !== 'main' && <span className="max-[560px]:hidden">Detaljblad · </span>}
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
