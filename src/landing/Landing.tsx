import {
  ArrowRight,
  Calculator,
  ChevronDown,
  RectangleGoggles,
  Keyboard,
  LockKeyhole,
  PencilLine,
  Puzzle,
  ScanBox,
  Ruler,
  Share2,
  Undo2,
  Variable,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import {
  createContext,
  lazy,
  Suspense,
  use,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { numberFormat } from '../model/numberFormat'
import { Logo } from '../panel/Logo'
import { canLogIn, loginUrl, startWithoutAccount } from '../sync/auth'
import { Boards } from './Boards'
import { bordBoards, bordCutList, bordDrawing, bordView, nattduksbordView, type View } from './models'
import { Sheets } from './Sheets'
import type { StageControl } from './Stage'
import { useInView, useMedia } from './useInView'

/**
 * Startsidan för den som inte är inloggad: vad appen gör, visat med riktiga
 * modeller gjorda i den. Överst ett bord i ek på en vridskiva, sedan ett
 * nattduksbord som sprängs isär när man scrollar, och sist kaplistan och kapschemat som appen
 * räknar fram ur bordet.
 */

// 3D-vyn (three.js) laddas för sig, så att texten syns direkt. Under tiden visas en stillbild
// av möbeln (npm run stills), som tonar över i 3D-vyn när den är klar.
const LazyStage = lazy(() => import('./Stage').then((m) => ({ default: m.Stage })))
const STILLS = import.meta.glob<string>('./stills/*.webp', { eager: true, query: '?url', import: 'default' })

type StageProps = Omit<ComponentProps<typeof LazyStage>, 'bodies' | 'angle' | 'fill' | 'onReady'> & {
  view: View
  fill?: number
}

function Stage({ view, fill = view.fill, shift = [0, 0], className = '', ...props }: StageProps) {
  const [loaded, setLoaded] = useState(false)
  const [ready, setReady] = useState(false)
  const light = STILLS[`./stills/${view.name}-light.webp`]
  const dark = STILLS[`./stills/${view.name}-dark.webp`]
  return (
    <div className={className}>
      {/* Mått i cqmin: bilden är lika stor som möbeln i 3D-vyn, som räknar ut sin storlek ur den kortaste sidan. */}
      <div className="relative size-full [container-type:size]">
        {light && dark && (
          <picture>
            <source srcSet={dark} media="(prefers-color-scheme: dark)" />
            <img
              src={light}
              alt=""
              onLoad={() => setLoaded(true)}
              style={{
                left: `${50 + shift[0] * 100}%`,
                top: `${50 + shift[1] * 100}%`,
                width: `${(100 * fill) / view.fill}cqmin`,
                transitionDuration: ready ? '1000ms' : '400ms',
              }}
              className={`pointer-events-none absolute max-w-none -translate-x-1/2 -translate-y-1/2 transition-opacity select-none ${
                loaded && !ready ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </picture>
        )}
        <Suspense fallback={null}>
          <LazyStage
            {...props}
            bodies={view.bodies}
            angle={view.angle}
            fill={fill}
            shift={shift}
            className="absolute inset-0"
            onReady={() => setReady(true)}
          />
        </Suspense>
      </div>
    </div>
  )
}

const mm = numberFormat(0, true)
const m3 = numberFormat(2)

// Tillbaka till appen efter inloggningen, också från /intro.
const login = () => location.assign(loginUrl('/'))
const open = () => location.assign('/')

/** Sant på /intro för den som kommer in i appen utan att logga in: inloggad eller utan konto. */
const OpenApp = createContext(false)

/**
 * Den mörka knappen. Utan inloggning på servern leder den i stället in i appen utan konto,
 * och för den som redan kommer in (OpenApp) rakt in i appen.
 */
function LoginButton({ big = false, children = 'Logga in' }: { big?: boolean; children?: ReactNode }) {
  const openApp = use(OpenApp)
  const on = canLogIn()
  return (
    <button
      onClick={openApp ? open : on ? login : () => void startWithoutAccount()}
      className={`group inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink font-medium text-canvas shadow-[0_12px_32px_-12px_rgba(30,20,10,0.6)] transition duration-200 hover:-translate-y-px hover:shadow-[0_16px_36px_-12px_rgba(30,20,10,0.7)] active:translate-y-0 ${
        big ? 'h-13 px-6 text-[15px]' : 'h-10 px-4 text-[13px]'
      }`}
    >
      {openApp ? 'Öppna Bygg' : on ? children : 'Börja bygga'}
      <ArrowRight
        size={big ? 18 : 16}
        aria-hidden
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </button>
  )
}

/** Kör appen utan konto: allt sparas bara i den här webbläsaren. Utan inloggning gör LoginButton det. */
function GuestButton({ big = false }: { big?: boolean }) {
  if (!canLogIn() || use(OpenApp)) return null
  return (
    <button
      onClick={() => void startWithoutAccount()}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl bg-ink/[0.07] font-medium text-ink transition-colors duration-200 hover:bg-ink/[0.12] ${
        big ? 'h-13 px-6 text-[15px]' : 'h-10 px-4 text-[13px]'
      }`}
    >
      Prova utan konto
    </button>
  )
}

/** Vad de två vägarna in betyder, under knapparna. */
function AccessNote({ className = '' }: { className?: string }) {
  if (use(OpenApp)) return null
  return (
    <p className={`flex items-start gap-1.5 text-[13px] leading-snug text-faint ${className}`}>
      <LockKeyhole size={14} aria-hidden className="mt-0.5 shrink-0" />
      <span>
        {canLogIn()
          ? 'Logga in för att synka mellan dina enheter. Utan konto sparas allt bara i den här webbläsaren.'
          : 'Det finns inga konton än. Allt sparas bara i den här webbläsaren.'}
      </span>
    </p>
  )
}

/** Glider in underifrån när det kommer i bild. */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, shown] = useInView<HTMLDivElement>(0.2)
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,translate] duration-900 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-[12px] font-semibold tracking-[0.18em] text-muted uppercase">{children}</p>
}

/** Ordet i trä: en gradient i ekens färger. */
function Wood({ children }: { children: ReactNode }) {
  return (
    <span className="bg-linear-to-br from-[#9a6a3a] via-[#c4955e] to-[#7d5129] bg-clip-text text-transparent dark:from-[#e0b27c] dark:via-[#f1cf9f] dark:to-[#c48e55]">
      {children}
    </span>
  )
}

function Header() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    // Läser var sidans början är i stället för scrollY, så att det fungerar vad som än scrollar.
    const on = () => setScrolled((document.querySelector('main')?.getBoundingClientRect().top ?? 0) < -24)
    on()
    addEventListener('scroll', on, { passive: true, capture: true })
    return () => removeEventListener('scroll', on, { capture: true })
  }, [])
  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)] transition-colors duration-300 ${
        scrolled ? 'bg-studio/75 shadow-[0_1px_0_rgba(0,0,0,0.06)] backdrop-blur-xl' : ''
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo height={30} />
        <LoginButton />
      </div>
    </header>
  )
}

function Hero() {
  const wide = useMedia('(min-width: 900px)')
  return (
    <section className="relative h-svh min-h-[620px] overflow-hidden">
      <Stage
        key={wide ? 'wide' : 'narrow'}
        view={bordView}
        className="absolute inset-0"
        shift={wide ? [0.2, 0.06] : [0, 0.24]}
        fill={wide ? bordView.fill : 0.74}
        label="Ett bord i ek som snurrar långsamt. Dra i sidled för att vrida det."
      />
      <div className="pointer-events-none relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-center px-6 max-[899px]:justify-start max-[899px]:pt-[calc(env(safe-area-inset-top)+104px)]">
        <div className="pointer-events-auto max-w-[520px]">
          <Reveal>
            <Eyebrow>Möbelsnickeri i 3D</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="text-[clamp(44px,7.4vw,88px)] leading-[0.95] font-semibold tracking-[-0.035em] text-balance">
              Rita möbeln.
              <br />
              <Wood>Få kaplistan.</Wood>
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p className="mt-6 max-w-[440px] text-[17px] leading-relaxed text-muted text-pretty max-[899px]:text-[16px]">
              Skissa på golvet, dra upp delarna med push/pull och se allt i riktigt trä. Bygg räknar ut varje bit och
              lägger ut dem på brädorna åt dig.
            </p>
          </Reveal>
          <Reveal delay={280} className="mt-8">
            <div className="flex flex-wrap items-center gap-3">
              <LoginButton big>Logga in och bygg</LoginButton>
              <GuestButton big />
            </div>
            <AccessNote className="mt-4 max-w-[400px]" />
          </Reveal>
        </div>
      </div>
      <p className="absolute right-6 bottom-8 z-10 text-right text-[12px] leading-snug text-faint tabular-nums max-[899px]:hidden">
        <span className="font-medium text-muted">Bord</span>
        <br />
        Ek · {bordCutList.totalCount} delar · ritat i Bygg
      </p>
      <ChevronDown
        size={22}
        aria-hidden
        className="absolute bottom-7 left-1/2 z-10 -translate-x-1/2 animate-bounce text-faint motion-reduce:animate-none"
      />
    </section>
  )
}

const STEPS = [
  {
    title: 'Varje del är en egen kropp.',
    text: 'Rita en rektangel på golvet eller på en yta och dra ut den. Sidor, topp och lådfront får material och fiberriktning, som i verkstaden.',
  },
  {
    title: 'Kopior som hänger ihop.',
    text: 'De två sidorna är en form och två placeringar. Ändra den ena, så följer den andra med. Mått kan styras av namngivna parametrar.',
  },
  {
    title: 'Se hur allt sitter ihop.',
    text: 'Sprängskissen drar isär möbeln så att varje fog syns, innan du har sågat något.',
  },
]

/** Nattduksbordet sprängs isär medan man scrollar genom avsnittet; texten byts i tre steg. */
function Explode() {
  const section = useRef<HTMLElement>(null)
  const control = useRef<StageControl>({ explode: 0, turn: 0 })
  const bar = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const el = section.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)))
      // Isär under första halvan, stilla en stund, sedan vrids den.
      const e = Math.min(1, p / 0.62)
      control.current.explode = e * e * (3 - 2 * e)
      control.current.turn = p * 1.1
      if (bar.current) bar.current.style.transform = `scaleX(${p})`
      setStep(p < 0.3 ? 0 : p < 0.66 ? 1 : 2)
    }
    const on = () => (frame ||= requestAnimationFrame(update))
    update()
    // capture: också när något annat än dokumentet scrollar.
    addEventListener('scroll', on, { passive: true, capture: true })
    addEventListener('resize', on)
    return () => {
      removeEventListener('scroll', on, { capture: true })
      removeEventListener('resize', on)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <section ref={section} className="relative h-[320svh]" aria-label="Så fungerar det">
      <div className="sticky top-0 grid h-svh grid-cols-[minmax(0,5fr)_minmax(0,7fr)] overflow-hidden max-[899px]:grid-cols-1 max-[899px]:grid-rows-[minmax(0,1fr)_auto]">
        <div className="relative z-10 mx-auto flex w-full max-w-[520px] flex-col justify-center px-6 max-[899px]:row-start-2 max-[899px]:pb-[max(32px,env(safe-area-inset-bottom))]">
          <Eyebrow>Så fungerar det</Eyebrow>
          <ol className="grid">
            {STEPS.map((s, i) => (
              // Alla steg i samma ruta: höjden är den största, så att inget hoppar när de byts.
              <li
                key={s.title}
                aria-current={step === i ? 'step' : undefined}
                className={`[grid-area:1/1] transition-[opacity,translate] duration-500 ease-out motion-reduce:transition-none ${
                  step === i
                    ? 'translate-y-0 opacity-100'
                    : i < step
                      ? '-translate-y-4 opacity-0'
                      : 'translate-y-4 opacity-0'
                }`}
              >
                <h2 className="text-[clamp(30px,4vw,48px)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance">
                  {s.title}
                </h2>
                <p className="mt-5 max-w-[420px] text-[17px] leading-relaxed text-muted text-pretty max-[899px]:text-[15px]">
                  {s.text}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex items-center gap-4">
            <span className="text-[12px] font-medium text-faint tabular-nums">0{step + 1} / 03</span>
            <div className="h-px flex-1 bg-line">
              <div ref={bar} className="h-px origin-left scale-x-0 bg-ink" />
            </div>
          </div>
        </div>
        <Stage
          view={nattduksbordView}
          control={control}
          explodeScale={1.15}
          spin={0}
          shift={[0, 0.02]}
          className="size-full max-[899px]:row-start-1"
          label="Ett nattduksbord i björk som delas upp i sina delar: sidor, topp, botten, hyllplan, rygg och lådfront med knopp."
        />
      </div>
    </section>
  )
}

function CutListCard() {
  const rows = bordCutList.rows
  return (
    <div className="overflow-hidden rounded-2xl bg-panel shadow-[0_30px_80px_-30px_rgba(40,25,10,0.45),0_0_0_1px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <p className="text-[15px] font-semibold">Bord</p>
          <p className="text-[12px] text-faint">Kaplista · L × B × T i mm</p>
        </div>
        <span className="rounded-full bg-[#b39270]/20 px-2.5 py-1 text-[12px] font-medium text-[#7d5129] dark:text-[#e0b27c]">
          Ek
        </span>
      </div>
      <table className="w-full table-fixed text-[13px] tabular-nums">
        <colgroup>
          <col className="w-14" />
          <col />
          <col className="w-40 max-[420px]:w-32" />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th>Antal</th>
            <th>Namn</th>
            <th>Mått</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <Row key={r.key} index={i}>
              <td className="py-2.5 pl-5 text-faint">{r.count}×</td>
              <td className="truncate py-2.5 pr-3">
                {r.names.length > 2 ? r.names[0]!.replace(/ \d+$/, '') : r.names.join(', ')}
              </td>
              <td className="py-2.5 pr-5 text-right whitespace-nowrap text-muted">
                {mm.format(r.length)} <span className="text-faint">×</span> {mm.format(r.width)}{' '}
                <span className="text-faint">×</span> {mm.format(r.thickness)}
              </td>
            </Row>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between border-t border-line bg-hover/60 px-5 py-3.5 text-[13px] tabular-nums">
        <span className="font-medium">{bordCutList.totalCount} delar</span>
        <span className="text-muted">{m3.format(bordCutList.totalVolumeM3)} m³ ek</span>
      </div>
    </div>
  )
}

function Row({ index, children }: { index: number; children: ReactNode }) {
  const [ref, shown] = useInView<HTMLTableRowElement>(0.1)
  return (
    <tr
      ref={ref}
      style={{ transitionDelay: `${index * 40}ms` }}
      className={`border-b border-line/60 transition-[opacity,translate] duration-500 last:border-0 motion-reduce:transition-none ${
        shown ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0'
      }`}
    >
      {children}
    </tr>
  )
}

function CutList() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-32 min-[900px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] max-[899px]:py-24">
      <Reveal>
        <Eyebrow>Kaplistan</Eyebrow>
        <h2 className="text-[clamp(32px,4.4vw,54px)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance">
          Räknad ur modellen. <Wood>Inte ur huvudet.</Wood>
        </h2>
        <p className="mt-6 max-w-[440px] text-[17px] leading-relaxed text-muted text-pretty">
          Längd, bredd och tjocklek mäts längs varje dels egen fiber, hur den än står i möbeln. Lika delar blir en rad.
          Det här är bordet ovanför, rad för rad.
        </p>
      </Reveal>
      <Reveal delay={120}>
        <CutListCard />
      </Reveal>
    </section>
  )
}

function CutPlan() {
  if (bordBoards.length === 0) return null
  const boards = bordBoards.reduce((n, g) => n + g.layout.boards.length, 0)
  const pieces = bordBoards.reduce((n, g) => n + g.layout.boards.flat().length, 0)
  const area = (l: (typeof bordBoards)[number]['layout']) => l.boards.length * l.stock.length * l.stock.width
  const used = bordBoards.reduce((s, g) => s + g.layout.boards.flat().reduce((t, p) => t + p.w * p.h, 0), 0)
  const waste = 1 - used / bordBoards.reduce((s, g) => s + area(g.layout), 0)
  return (
    <section className="px-6 pb-32 max-[899px]:pb-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto mb-14 max-w-[640px] text-center">
          <Eyebrow>Kapschemat</Eyebrow>
          <h2 className="text-[clamp(32px,4.4vw,54px)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance">
            Och lagt på brädorna.
          </h2>
          <p className="mt-6 text-[17px] leading-relaxed text-muted text-pretty">
            Delarna läggs ut på svenska standardmått, med sågsnitt och rensade ändar. Du ser vad du ska köpa och hur
            mycket som blir över. Här är allt virke till bordet.
          </p>
        </Reveal>
        <div className="flex flex-col gap-8">
          {bordBoards.map(({ key, material, layout }) => (
            <div key={key}>
              <p className="mb-2.5 text-[13px] text-faint tabular-nums">
                <span className="font-medium text-muted capitalize">{material}</span> {layout.thickness} ×{' '}
                {mm.format(layout.stock.width)} × {mm.format(layout.stock.length)} · {layout.boards.length}{' '}
                {layout.boards.length === 1 ? 'bräda' : 'brädor'}
              </p>
              <Boards material={material} layout={layout} />
            </div>
          ))}
        </div>
        <p className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-1 text-[13px] text-faint tabular-nums">
          <span>
            {boards} brädor · {pieces} delar
          </span>
          <span>{Math.round(waste * 100)} % spill</span>
        </p>
      </div>
    </section>
  )
}

function Drawing() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-x-16 gap-y-14 px-6 pb-32 min-[900px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] max-[899px]:pb-24">
      <Reveal className="min-[900px]:order-2">
        <Eyebrow>Ritningen</Eyebrow>
        <h2 className="text-[clamp(32px,4.4vw,54px)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance">
          Ta med den <Wood>till verkstaden.</Wood>
        </h2>
        <p className="mt-6 max-w-[440px] text-[17px] leading-relaxed text-muted text-pretty">
          Bygg ritar hela möbeln på A4: en sammanställning med positioner, huvudvyer med yttermått och ett detaljblad
          per del, med mått, hål och tappar. Sist kaplistan och kapschemat. Som PDF, att skriva ut eller dela.
        </p>
        <p className="mt-6 text-[13px] text-faint tabular-nums">
          Bordet: {bordDrawing.sheets} blad, {bordDrawing.details.length} detaljblad
        </p>
      </Reveal>
      <Reveal delay={120}>
        <Sheets />
      </Reveal>
    </section>
  )
}

type Feature = { icon: LucideIcon; title: string; text: string }

/** Det som gör att appen inte står i vägen. */
const EASY: Feature[] = [
  {
    icon: Keyboard,
    title: 'Skriv måttet medan du drar',
    text: 'Måttet syns medan du ritar och drar. Skriv det du vill ha, så blir det exakt. På datorn behöver du inte ens klicka i fältet.',
  },
  {
    icon: Calculator,
    title: 'Sifferblock på skärmen',
    text: 'På mobil och iPad täcker inget tangentbord halva vyn. Räkna direkt i fältet, till exempel 900 − 2 × 22.',
  },
  {
    icon: Puzzle,
    title: 'Tapp och tapphål av sig själva',
    text: 'Välj sargen och benet den ska in i. Bygg gör tappen och hålet med tumregler för måtten, och de passar alltid.',
  },
  {
    icon: Ruler,
    title: 'Virke som finns att köpa',
    text: 'Push/pull snäpper till vanliga tjocklekar och säger varför. Kapschemat utgår från svenska standardmått.',
  },
  {
    icon: Undo2,
    title: 'Ångra, också i morgon',
    text: 'Historiken sparas med modellen. Ladda om sidan eller stäng appen, och ångra fungerar ändå.',
  },
  {
    icon: WifiOff,
    title: 'Offline och synkat',
    text: 'Allt sparas på enheten först. Har du ändrat på två enheter sparas båda; ingen version skrivs över.',
  },
]

/** Resten, kortare. */
const MORE: Feature[] = [
  { icon: PencilLine, title: 'Apple Pencil', text: 'Pennan ritar, fingrarna vrider och zoomar.' },
  { icon: Variable, title: 'Parametrar', text: 'Namngivna mått som styr resten.' },
  { icon: ScanBox, title: 'AR på iOS', text: 'Möbeln i rummet, i verklig storlek.' },
  { icon: RectangleGoggles, title: 'VR', text: 'Gå runt möbeln i headsetet.' },
  { icon: Share2, title: 'Export', text: 'GLB, OBJ, STL och 3MF för Blender, CAD och 3D-skrivare.' },
]

function Features() {
  return (
    <section className="border-t border-line/70 bg-canvas/60 px-6 py-28 max-[899px]:py-20">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-16 max-w-[640px] max-[899px]:mb-12">
          <Eyebrow>Friktionsfritt</Eyebrow>
          <h2 className="text-[clamp(32px,4.4vw,54px)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance">
            Gjord för att <Wood>inte stå i vägen.</Wood>
          </h2>
        </Reveal>
        <div className="grid grid-cols-3 gap-x-10 gap-y-14 max-[899px]:grid-cols-2 max-[560px]:grid-cols-1 max-[560px]:gap-y-10">
          {EASY.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <div className="mb-4 grid size-11 place-items-center rounded-xl bg-panel shadow-[0_6px_18px_-8px_rgba(40,25,10,0.35),0_0_0_1px_rgba(0,0,0,0.04)]">
                <f.icon size={20} strokeWidth={1.75} aria-hidden />
              </div>
              <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{f.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted text-pretty">{f.text}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-20 border-t border-line/70 pt-10 max-[899px]:mt-14">
          <ul className="grid grid-cols-5 gap-x-8 gap-y-6 max-[899px]:grid-cols-2 max-[560px]:grid-cols-1">
            {MORE.map((f) => (
              <li key={f.title} className="flex gap-3">
                <f.icon size={18} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-faint" />
                <p className="text-[13px] leading-snug text-muted">
                  <span className="block font-medium text-ink">{f.title}</span>
                  {f.text}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}

/** En rektangel på golvet som dras upp till en kropp och ner igen, som push/pull i appen. */
function PushPull() {
  const P0 = [0, 0]
  const P1 = [52, 30]
  const P2 = [20.8, 48]
  const P3 = [-31.2, 18]
  const H = 34
  const up = (p: number[], t: number) => `${p[0]},${p[1]! - H * t}`
  // En sida: kanten på golvet och samma kant uppdragen.
  const quad = (a: number[], b: number[], t: number) => `${up(a, 0)} ${up(b, 0)} ${up(b, t)} ${up(a, t)}`
  const top = (t: number) => [P0, P1, P2, P3].map((p) => up(p, t)).join(' ')
  // Platt, upp, stilla, ner: fyra sekunder.
  const keyTimes = '0;0.2;0.55;0.85;1'
  const spline = '0 0 1 1;0.3 0 0.2 1;0 0 1 1;0.5 0 0.5 1'
  const anim = (values: (t: number) => string) => (
    <animate
      attributeName="points"
      dur="4s"
      repeatCount="indefinite"
      calcMode="spline"
      keyTimes={keyTimes}
      keySplines={spline}
      values={[0, 0, 1, 1, 0].map(values).join(';')}
    />
  )
  return (
    <svg viewBox="-45 -52 110 110" className="mb-8 size-28" aria-hidden>
      <polygon points={top(0)} fill="none" stroke="var(--color-accent)" strokeWidth="1.2" strokeDasharray="3 2.5" />
      <polygon points={quad(P3, P2, 0)} fill="#c49a66">
        {anim((t) => quad(P3, P2, t))}
      </polygon>
      <polygon points={quad(P2, P1, 0)} fill="#a97f4f">
        {anim((t) => quad(P2, P1, t))}
      </polygon>
      <polygon points={top(0)} fill="#e2c496" stroke="#8a6238" strokeOpacity="0.35" strokeWidth="0.6">
        {anim(top)}
      </polygon>
      {/* Pilen på ytan, som i 3D-vyn. */}
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          dur="4s"
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes={keyTimes}
          keySplines={spline}
          values={[0, 0, 1, 1, 0].map((t) => `0 ${-H * t}`).join(';')}
        />
        <line x1="10.4" y1="24" x2="10.4" y2="6" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
        <path d="M5.4 10 10.4 3.5 15.4 10z" fill="var(--color-accent)" />
      </g>
    </svg>
  )
}

function Closing() {
  return (
    <section className="px-6 py-32 text-center max-[899px]:py-24">
      <Reveal className="mx-auto flex max-w-[560px] flex-col items-center">
        <PushPull />
        <h2 className="text-[clamp(32px,4.4vw,54px)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance">
          Nästa möbel börjar <Wood>med en rektangel.</Wood>
        </h2>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <LoginButton big>Logga in och bygg</LoginButton>
          <GuestButton big />
        </div>
        <AccessNote className="mt-5 max-w-[400px] text-left" />
      </Reveal>
    </section>
  )
}

/**
 * Sidan beter sig som en webbsida, inte som appen: text går att markera och sidan går att
 * zooma (se index.css). Utan fält finns inget som Safari zoomar in på, så maximum-scale behövs inte.
 */
function useWebPage() {
  useEffect(() => {
    const root = document.documentElement
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    const before = viewport?.content
    root.dataset.page = 'web'
    if (viewport && before) viewport.content = before.replace(/,\s*maximum-scale=[^,]*/, '')
    return () => {
      delete root.dataset.page
      if (viewport && before) viewport.content = before
    }
  }, [])
}

export function Landing({ openApp = false }: { openApp?: boolean }) {
  useWebPage()
  return (
    <OpenApp value={openApp}>
      <div className="min-h-full bg-studio text-ink">
        <Header />
        <main>
          <Hero />
          <Explode />
          <CutList />
          <CutPlan />
          <Drawing />
          <Features />
          <Closing />
        </main>
        <footer className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 pt-6 pb-[max(32px,env(safe-area-inset-bottom))] text-[12px] text-faint">
          <Logo height={18} />
          <span>Mått i millimeter. Data på din egen server.</span>
        </footer>
      </div>
    </OpenApp>
  )
}
