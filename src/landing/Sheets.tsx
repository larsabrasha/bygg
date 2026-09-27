import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { layoutMainViews, MAIN_VIEW_CAMERA, type MainView } from '../model/mainViews'
import { MainViewsSheet } from '../panel/MainViewsSheet'
import { PartSheet } from '../panel/PartSheet'
import type { OrthoShot } from '../scene/OrthoRenderer'
import { bord, bordCutList, bordDrawing } from './models'
import { useInView } from './useInView'

/**
 * Riktiga blad ur ritningen av bordet, som en bunt papper: huvudvyerna och
 * två detaljblad. Bunten bläddras av sig själv medan den syns, och ett tryck tar
 * nästa blad. Bladen är appens egna (panel/MainViewsSheet och PartSheet).
 */

// Bilderna i huvudvyerna tas med three.js, som laddas först när bunten närmar sig.
const OrthoRenderer = lazy(() => import('../scene/OrthoRenderer').then((m) => ({ default: m.OrthoRenderer })))

/** Pixlar per mm på papperet, som i ritningen. */
const PX_PER_MM = 8
const NEXT_MS = 4500
/** Så länge bladet som läggs undan är ute åt sidan innan det hamnar sist. */
const OUT_MS = 380

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
/** Bladet som läggs undan: ut åt höger, sedan sist i bunten. */
const OUT = 'translate(36%, 9%) rotate(7deg) scale(0.98)'

export function Sheets() {
  const [ref, near] = useInView<HTMLDivElement>(0)
  const [images, setImages] = useState<Partial<Record<MainView, string>>>({})
  const [top, setTop] = useState(0)
  const [leaving, setLeaving] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  // Har man bläddrat själv bläddrar bunten inte längre av sig själv.
  const [manual, setManual] = useState(false)

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

  // Bladet som ska hamna överst när det som läggs undan är ute; ett nytt val under tiden vinner.
  const wanted = useRef(0)
  const goTo = (next: number) => {
    wanted.current = next
    if (leaving !== null || next === top) return
    setLeaving(top)
    setTimeout(() => {
      setTop(wanted.current)
      setLeaving(null)
    }, OUT_MS)
  }

  useEffect(() => {
    if (!near || paused || manual) return
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
          goTo((top + 1) % PAGES.length)
        }}
      >
        {PAGES.map((p, i) => {
          const depth = (i - top + PAGES.length) % PAGES.length
          const out = leaving === i
          return (
            <div
              key={p.key}
              aria-hidden={depth !== 0}
              className="absolute inset-0 overflow-hidden rounded-[3px] bg-[#fdfcf9] text-left shadow-[0_1px_1px_rgba(40,25,10,0.08),0_8px_16px_-6px_rgba(40,25,10,0.18),0_36px_70px_-30px_rgba(40,25,10,0.5)] transition-[transform,filter] duration-500 ease-[cubic-bezier(0.3,0.7,0.2,1)] motion-reduce:transition-none"
              style={{
                transform: out ? OUT : PLACE[depth],
                // Bladet som läggs undan ligger kvar överst tills det är ute; sedan sist.
                zIndex: out ? PAGES.length + 1 : PAGES.length - depth,
                filter: depth === 0 || out ? 'none' : `brightness(${1 - depth * 0.04})`,
              }}
            >
              {page(p.key)}
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
