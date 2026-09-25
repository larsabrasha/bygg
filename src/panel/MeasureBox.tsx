import { Check, Copy, Repeat, X } from 'lucide-react'
import { AXIS_COLORS } from '../scene/colors'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore, type Axis } from '../store/toolStore'
import {
  amendableOp,
  applyMeasure,
  cancel,
  dismissLast,
  extendableCopy,
  liveMeasure,
  repeatLastPushPull,
  setCopy,
} from '../tools/actions'
import { ExprInput } from './ExprInput'
import { rulerResult, type RulerPoint } from '../model/ruler'
import { ghostButton, secondaryButton, toggleButton } from './ui'
import { Tip } from './Tip'

const fmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1, useGrouping: false })

/** Kvadratisk ikonknapp för Avbryt och OK. */
const iconAction = 'grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg narrow:size-11'

/**
 * Måttfält som SketchUps "Measurements": visar aktuella mått under en
 * operation, och tar emot exakta värden. På desktop kan man skriva direkt
 * utan att klicka i fältet (se useShortcuts).
 */
export function MeasureBox() {
  const tool = useToolStore((s) => s.tool)
  const op = useToolStore((s) => s.op)
  const measure = useToolStore((s) => s.measure)
  const setMeasure = useToolStore((s) => s.setMeasure)
  const last = useToolStore((s) => s.lastPushPull)
  const setTool = useToolStore((s) => s.setTool)
  const copy = useToolStore((s) => s.copy)
  const ruler = useToolStore((s) => s.ruler)
  const rulerHover = useToolStore((s) => s.rulerHover)
  // extendableCopy och amendableOp läser dessa; prenumerera så att rutan ritas om när de ändras.
  useToolStore((s) => s.lastCopy)
  useToolStore((s) => s.lastOp)
  useDocumentStore((s) => s.selection)
  useDocumentStore((s) => s.doc)

  // Efter en kopia kan man skriva hur många det ska bli (som "5x" i SketchUp).
  const extending = !op && tool === 'move' ? extendableCopy() : null
  // Efter en avslutad operation ligger rutan kvar med värdet, så att man kan skriva ett annat.
  const amend = !op && !extending ? amendableOp() : null
  const shown = op ?? amend?.op ?? null

  // I Välj syns rutan bara under och direkt efter en operation (pilen eller "Dra ut").
  if (tool === 'select' && !shown) return null

  const hint = extending
    ? 'Kopian är gjord. Skriv antal för fler med samma avstånd.'
    : amend
      ? 'Klart. Skriv ett annat värde för att ändra.'
      : !op && tool === 'move' && copy
        ? 'Kopia: dra i en pil, en båge eller delen. Originalet står kvar.'
        : !op
          ? {
              select: '',
              rect: 'Tryck där första hörnet ska vara – på golvet eller på en yta.',
              pushpull: 'Dra i en skiss eller en sida av en del, eller tryck på den.',
              move: 'Dra i en pil för att flytta längs X, Y eller Z, eller i en båge för att vrida. Du kan också dra i själva delen.',
              measure: '',
            }[tool]
          : {
              rect: 'Tryck på andra hörnet, eller skriv längd och bredd.',
              pushpull: 'Dra längs pilen, eller skriv avståndet.',
              move:
                op.kind === 'move' && op.axis !== null
                  ? 'Dra längs pilen, eller skriv avståndet.'
                  : 'Dra dit delen ska, eller skriv avståndet.',
              rotate: 'Dra runt bågen (steg om 15°), eller skriv vinkeln.',
            }[op.kind]

  const live = shown ? liveMeasure(shown) : extending ? [extending.count] : []
  const axis = shown?.kind === 'rotate' ? shown.axis : shown?.kind === 'move' ? shown.axis : null
  const fields: { label: string; axis: Axis | null }[] = extending
    ? [{ label: 'Antal kopior', axis: null }]
    : shown?.kind === 'rect'
      ? [
          { label: 'Längd', axis: null },
          { label: 'Bredd', axis: null },
        ]
      : [{ label: shown?.kind === 'rotate' ? 'Vinkel runt' : 'Avstånd', axis }]
  const unit = extending ? 'st' : shown?.kind === 'rotate' ? '°' : 'mm'

  const copyToggle = tool === 'move' && (
    <Tip label="Det du flyttar eller vrider blir en ny länkad kopia" keys="Alt" side="top">
      <button type="button" aria-pressed={copy} onClick={() => setCopy(!copy)} className={toggleButton}>
        <Copy size={16} strokeWidth={1.75} aria-hidden />
        Kopia
      </button>
    </Tip>
  )

  if (tool === 'measure') return <RulerBox ruler={ruler} hover={rulerHover} onDone={() => setTool('select')} />

  return (
    <div className="absolute bottom-3 left-1/2 w-max max-w-[calc(100%-24px)] -translate-x-1/2 rounded-xl border border-line bg-panel/90 p-2 shadow-lg backdrop-blur-md">
      {shown || extending ? (
        <>
          <p className="px-1 pb-1.5 text-xs text-muted">{hint}</p>
          <form
            className="flex flex-wrap items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              applyMeasure()
            }}
          >
            {fields.map(({ label, axis }, i) => (
              <label
                key={label}
                className="flex h-10 items-center gap-2 rounded-lg border border-line bg-field pr-2.5 pl-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft narrow:h-11"
              >
                <span className="text-xs whitespace-nowrap text-muted">
                  {label}
                  {axis !== null && (
                    <b className="ml-1 font-bold" style={{ color: AXIS_COLORS[axis] }}>
                      {'XYZ'[axis]}
                    </b>
                  )}
                </span>
                {/* Nuvarande värde visas som platshållare i full färg; det man skriver ersätter det. */}
                <ExprInput
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={measure[i] ?? ''}
                  placeholder={fmt.format(live[i] ?? 0)}
                  placement="above"
                  wrapperClass="block"
                  onChange={(t) => setMeasure(i as 0 | 1, t)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cancel()
                  }}
                  className="w-20 min-w-0 bg-transparent text-right text-base font-semibold text-ink tabular-nums outline-none placeholder:text-ink"
                />
                <span className="text-[13px] text-unit">{unit}</span>
              </label>
            ))}
            {op?.kind === 'pushpull' && last && (
              <Tip label="Samma djup som förra gången (eller dubbeltryck)" side="top">
                <button type="button" className={`${ghostButton} text-muted`} onClick={repeatLastPushPull}>
                  <Repeat size={15} strokeWidth={1.75} aria-hidden />
                  Som förra
                  <span className="text-ink tabular-nums">{last.expr ?? `${fmt.format(last.distance)} mm`}</span>
                </button>
              </Tip>
            )}
            {copyToggle}
            <span aria-hidden className="mx-0.5 h-6 w-px bg-line" />
            {(op || amend) && (
              <Tip label={op ? 'Avbryt' : 'Stäng utan att ändra'} keys={op ? 'Esc' : undefined} side="top">
                <button
                  type="button"
                  aria-label={op ? 'Avbryt' : 'Stäng'}
                  onClick={op ? cancel : dismissLast}
                  className={`${iconAction} text-muted hover:bg-hover`}
                >
                  <X size={18} strokeWidth={2} aria-hidden />
                </button>
              </Tip>
            )}
            <Tip label="OK" keys="Enter" side="top">
              <button
                type="submit"
                aria-label="OK"
                className={`${iconAction} bg-accent text-on-accent hover:opacity-90`}
              >
                <Check size={18} strokeWidth={2.25} aria-hidden />
              </button>
            </Tip>
          </form>
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <p className="max-w-96 px-1 text-[13px] text-muted">{hint}</p>
          {copyToggle}
          {/* Push/pull- och Flytta-läget har ingen knapp i verktygsraden att gå tillbaka med. */}
          {(tool === 'pushpull' || tool === 'move') && (
            <button type="button" className={secondaryButton} onClick={() => setTool('select')}>
              Klar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Mät: avståndet mellan två punkter (eller två parallella ytor), uppdelat
 * på X, Y och Z. Med mus visas avståndet till punkten under pekaren redan
 * innan man tryckt på den.
 */
function RulerBox({ ruler, hover, onDone }: { ruler: RulerPoint[]; hover: RulerPoint | null; onDone: () => void }) {
  const [a, b] = ruler.length === 2 ? ruler : [ruler[0], hover]
  const result = a && b ? rulerResult(a, b) : null
  const hint =
    ruler.length === 0
      ? 'Tryck på en punkt eller yta. Hörn och kantmitter snäpper. Två parallella ytor mäts vinkelrätt mot varandra.'
      : ruler.length === 1
        ? 'Tryck på nästa punkt eller yta.'
        : 'Tryck igen för att mäta något nytt.'
  return (
    <div className="absolute bottom-3 left-1/2 w-max max-w-[calc(100%-24px)] -translate-x-1/2 rounded-xl border border-line bg-panel/90 p-2 shadow-lg backdrop-blur-md">
      <p className="max-w-96 px-1 pb-1.5 text-xs text-muted">{hint}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <output
          aria-live="polite"
          className={`flex h-10 items-center gap-2 rounded-lg bg-field px-3 narrow:h-11 ${result && ruler.length === 2 ? '' : 'opacity-60'}`}
        >
          <span className="text-xs whitespace-nowrap text-muted">
            {result?.kind === 'planes' ? 'Mellan ytorna' : 'Avstånd'}
          </span>
          <span className="min-w-12 text-right text-base font-semibold text-ink tabular-nums">
            {result ? fmt.format(result.distance) : '–'}
          </span>
          <span className="text-[13px] text-unit">mm</span>
        </output>
        {/* Delarna längs axlarna; mellan två ytor är det bara en, så de visas bara mellan punkter. */}
        {result?.kind === 'points' &&
          ([0, 1, 2] as const).map((i) => (
            <span key={i} className="flex h-10 items-center gap-1 px-1 text-[13px] tabular-nums narrow:h-11">
              <b className="text-xs font-bold" style={{ color: AXIS_COLORS[i] }}>
                {'XYZ'[i]}
              </b>
              {fmt.format(Math.abs(result.delta[i]))}
            </span>
          ))}
        <span aria-hidden className="mx-0.5 h-6 w-px bg-line" />
        <button type="button" className={secondaryButton} onClick={onDone}>
          Klar
        </button>
      </div>
    </div>
  )
}
