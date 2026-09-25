import { Check, Copy, Repeat, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { isConstant } from '../model/expr'
import { AXIS_COLORS } from '../scene/colors'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore, type Axis } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import {
  amendableOp,
  applyMeasure,
  cancel,
  extendableCopy,
  faceDimension,
  liveMeasure,
  readyPushPull,
  repeatLastPushPull,
  typedPushPull,
  setCopy,
  startReadyPushPull,
  undoLast,
} from '../tools/actions'
import { ExprInput } from './ExprInput'
import { rulerResult, type RulerPoint } from '../model/ruler'
import { bottomBox, ghostButton, iconAction, toggleButton } from './ui'
import { Tip } from './Tip'
import { numberFormat } from '../model/numberFormat'
import { useCoversView } from './useCoversView'
import { useNumpadStore } from './numpadStore'

const fmt = numberFormat(1)

/** Kvadratisk ikonknapp för Avbryt och OK. */
const okButton = `${iconAction} bg-accent text-on-accent hover:opacity-90`

/** Klar: lämna verktyget och gå tillbaka till Välj. Samma bock som OK, som överallt i rutan. */
function DoneButton({ onClick }: { onClick: () => void }) {
  return (
    <Tip label="Klar" keys="Esc" side="top">
      <button type="button" aria-label="Klar" onClick={onClick} className={okButton}>
        <Check size={18} strokeWidth={2.25} aria-hidden />
      </button>
    </Tip>
  )
}

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
  const doc = useDocumentStore((s) => s.doc)
  const cover = useCoversView<HTMLDivElement>()
  const numpadOpen = useNumpadStore((s) => s.open)
  // Medan man skriver visar 3D-vyn det skrivna, som om man dragit dit (inte bara efter OK).
  useEffect(() => {
    const t = useToolStore.getState()
    if (t.op?.kind !== 'pushpull' || !measure[0].trim()) return
    const before = t.op.target.kind === 'body' ? (faceDimension(t.op.target)?.extent ?? null) : null
    const next = typedPushPull(t.op, measure[0], before)
    if (next && next.distance >= (t.op.min ?? -Infinity) && next.distance !== t.op.distance)
      t.setOp({ ...t.op, distance: next.distance })
  }, [measure])
  /** Det fälten fylldes med när de fick fokus (fillOnFocus), per fält. */
  const filled = useRef<(string | null)[]>([null, null])

  // Efter en kopia kan man skriva hur många det ska bli (som "5x" i SketchUp).
  const extending = !op && tool === 'move' ? extendableCopy() : null
  // Efter ett drag ligger rutan kvar med värdet, så att man kan skriva ett exakt mått i stället.
  // Sparar man med OK (eller Enter, Som förra) stängs den. Skriver man ett tal direkt efteråt
  // (tangentbordet) visas den igen och ändrar det man nyss gjorde, som i SketchUp.
  const amendable = !op && !extending ? amendableOp() : null
  const amend = amendable && (!amendable.saved || measure.some((m) => m !== '')) ? amendable : null
  const shown = op ?? amend?.op ?? null
  // En vald sida eller skiss i Välj: rutan syns direkt, och det man skriver drar ut den.
  useToolStore((s) => s.combining)
  useViewStore((s) => s.exploded)
  const ready = !shown && !extending ? readyPushPull() : null

  // I Välj syns rutan bara när något är valt, och under och direkt efter en operation.
  if (tool === 'select' && !shown && !ready) return null

  // Push/pull ser likadan ut hela vägen: vald sida, medan man drar och efter ett drag (ändra).
  // Samma text och samma knappar på samma plats, så att rutan inte hoppar när läget byts.
  const pushpullBox = ready !== null || shown?.kind === 'pushpull'
  const hint = extending
    ? 'Kopian är gjord. Skriv antal för fler med samma avstånd.'
    : pushpullBox
      ? 'Dra i pilen, eller skriv måttet.'
      : amend
        ? 'Klart. Skriv ett annat värde för att ändra.'
        : !op && tool === 'move' && copy
          ? 'Kopia: dra i en pil, en båge eller delen. Originalet står kvar.'
          : !op
            ? {
                select: '',
                rect: 'Tryck där första hörnet ska vara – på golvet eller på en yta.',
                circle: 'Tryck där mitten ska vara – på golvet eller på en yta.',
                pushpull: 'Dra i en skiss eller en sida av en del, eller tryck på den.',
                move: 'Dra i en pil för att flytta längs X, Y eller Z, eller i en båge för att vrida. Du kan också dra i själva delen.',
                measure: '',
              }[tool]
            : {
                rect:
                  op.kind === 'rect' && op.shape === 'circle'
                    ? 'Tryck där kanten ska vara, eller skriv diametern.'
                    : 'Tryck på andra hörnet, eller skriv längd och bredd.',
                pushpull: 'Dra längs pilen, eller skriv avståndet.',
                move:
                  op.kind === 'move' && op.axis !== null
                    ? 'Dra längs pilen, eller skriv avståndet.'
                    : 'Dra dit delen ska, eller skriv avståndet.',
                rotate: 'Dra runt bågen (steg om 15°), eller skriv vinkeln.',
              }[op.kind]

  // En sida på en del: fältet visar hela måttet (det delen blir), inte ändringen; den syns vid pilen.
  // Under draget är dokumentet som före, efteråt som efter.
  const faceTarget =
    shown?.kind === 'pushpull' && shown.target.kind === 'body'
      ? shown.target
      : !shown && ready?.kind === 'body'
        ? ready
        : null
  const dimension = faceTarget ? faceDimension(faceTarget) : null
  // Vad det skrivna blir: "+70" eller ett uttryck visar hela måttet efteråt under fältet.
  // Måttet före: under draget är dokumentet som före, efter ett drag (ändra) som efter.
  const pushpull = shown?.kind === 'pushpull' ? shown : null
  const base = dimension && pushpull ? dimension.extent - (op ? 0 : pushpull.distance) : null
  const typed = pushpull ? typedPushPull(pushpull, measure[0], base) : null
  const total = typed?.total != null && (!typed.whole || !isConstant(measure[0])) ? typed.total : null
  const live = dimension
    ? [dimension.extent + (op?.kind === 'pushpull' ? op.distance : 0)]
    : shown
      ? liveMeasure(shown)
      : extending
        ? [extending.count]
        : ready
          ? [0]
          : []
  const axis = shown?.kind === 'rotate' ? shown.axis : shown?.kind === 'move' ? shown.axis : null
  const fields: { label: string; axis: Axis | null }[] = extending
    ? [{ label: 'Antal kopior', axis: null }]
    : shown?.kind === 'rect' && shown.shape === 'circle'
      ? [{ label: 'Diameter', axis: null }]
      : shown?.kind === 'rect'
        ? [
            { label: 'Längd', axis: null },
            { label: 'Bredd', axis: null },
          ]
        : [{ label: dimension?.label ?? (shown?.kind === 'rotate' ? 'Vinkel runt' : 'Avstånd'), axis }]
  const unit = extending ? 'st' : shown?.kind === 'rotate' ? '°' : 'mm'

  const copyToggle = tool === 'move' && (
    <Tip label="Det du flyttar eller vrider blir en ny länkad kopia" keys="Alt" side="top">
      <button type="button" aria-pressed={copy} onClick={() => setCopy(!copy)} className={toggleButton}>
        <Copy size={16} strokeWidth={1.75} aria-hidden />
        Kopia
      </button>
    </Tip>
  )

  // En skiss på en del: ny del, tillägg på delen eller urtag i den. Förvalt efter riktningen.
  const sketchOn = op?.kind === 'pushpull' && op.target.kind === 'sketch' ? op : null
  const onPart =
    sketchOn?.target.kind === 'sketch' &&
    doc.sketches.some((s) => s.id === sketchOn.target.id && s.on && doc.instances.some((i) => i.id === s.on))
  const effective = sketchOn ? (sketchOn.mode ?? 'auto') : 'auto'
  const current = effective === 'auto' ? (sketchOn && sketchOn.distance < 0 ? 'subtract' : 'new') : effective
  const modeToggle = sketchOn && onPart && (
    <div role="group" aria-label="Blir" className="flex gap-0.5">
      {(
        [
          ['new', 'Ny del', 'En egen del, med egen rad i kaplistan'],
          ['add', 'Lägg till', 'Sitter ihop med delen skissen ligger på, t.ex. en tapp'],
          ['subtract', 'Skär ut', 'Skärs ut ur delen skissen ligger på, t.ex. ett tapphål'],
        ] as const
      ).map(([mode, label, tip]) => (
        <Tip key={mode} label={tip} side="top">
          <button
            type="button"
            aria-pressed={current === mode}
            onClick={() => useToolStore.getState().setOp({ ...sketchOn, mode })}
            className={toggleButton}
          >
            {label}
          </button>
        </Tip>
      ))}
    </div>
  )

  if (tool === 'measure') return <RulerBox ruler={ruler} hover={rulerHover} onDone={() => setTool('select')} />

  return (
    <div ref={cover} className={bottomBox}>
      {shown || extending || ready ? (
        <>
          {/* Samma höjd hela tiden: vad det skrivna blir står i stället för hjälptexten, inte på en egen rad. */}
          <p className={`px-1 pb-1.5 text-xs ${total !== null ? 'text-accent tabular-nums' : 'text-muted'}`}>
            {total !== null ? `= ${fmt.format(total)} mm` : hint}
          </p>
          <form
            className="flex flex-wrap items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              // OK betyder klar, i ett tryck: det man ändrat sparas, och i push/pull avmarkeras sidan,
              // så att rutan inte kommer tillbaka för samma sida och behöver ett OK till.
              const t = useToolStore.getState()
              const text = t.measure[0].trim()
              const unchanged = ready && !t.op && (text === '' || text === fmt.format(live[0] ?? 0))
              if (!unchanged && !applyMeasure()) return
              if (!pushpullBox) return
              // Fältet tomt igen, så att det inte står kvar till nästa sida som väljs.
              t.setMeasure(0, '')
              t.setMeasure(1, '')
              useDocumentStore.getState().select(null)
            }}
          >
            {fields.map(({ label, axis }, i) => (
              <label
                key={label}
                data-field-box
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
                  // Nuvarande mått blir text i fältet när man trycker i det, så att det går att ändra.
                  fillOnFocus={fmt.format(live[i] ?? 0)}
                  onFill={(t) => {
                    filled.current[i] = t
                    setMeasure(i as 0 | 1, t)
                  }}
                  // Lämnar man fältet oförändrat utan att något pågår: tomt igen, så att det inte står
                  // kvar ett gammalt mått när man väljer något annat.
                  onBlur={() => {
                    const t = useToolStore.getState()
                    if (!t.op && t.measure[i] === filled.current[i]) t.setMeasure(i as 0 | 1, '')
                    filled.current[i] = null
                  }}
                  onChange={(t) => {
                    // Det första man ändrar startar dragningen av det valda.
                    if (ready) startReadyPushPull()
                    setMeasure(i as 0 | 1, t)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cancel()
                  }}
                  // Fältet växer med texten (ett uttryck som "mått1 * 5" ska synas helt), mellan
                  // min- och maxbredden; ch är ungefär ett tecken.
                  style={{ width: `${(measure[i] || fmt.format(live[i] ?? 0)).length + 1}ch` }}
                  className="min-w-20 max-w-44 bg-transparent text-right narrow:min-w-16 text-base font-semibold text-ink tabular-nums outline-none placeholder:text-ink"
                />
                <span className="text-[13px] text-unit">{unit}</span>
              </label>
            ))}
            {pushpullBox && last && (
              <Tip label="Samma djup som förra gången (eller dubbeltryck)" side="top">
                <button
                  type="button"
                  // Efter ett drag är förra djupet just det draget: inget att upprepa.
                  disabled={!op && !ready}
                  className={`${ghostButton} text-muted`}
                  onClick={() => {
                    if (ready) startReadyPushPull()
                    repeatLastPushPull()
                  }}
                >
                  <Repeat size={15} strokeWidth={1.75} aria-hidden />
                  Som förra
                  <span className="text-ink tabular-nums">{last.expr ?? `${fmt.format(last.distance)} mm`}</span>
                </button>
              </Tip>
            )}
            {copyToggle}
            {modeToggle}
            {/* På smal skärm är rutan smalare (den slutar före verktygslisten); där får fält, kryss och bock plats på en rad utan strecket. */}
            {!pushpullBox && <span aria-hidden className="mx-0.5 h-6 w-px bg-line narrow:hidden" />}
            {/* Avbryt och OK hör ihop: får de inte plats på raden flyttar de ner tillsammans, till höger.
                Inte i push/pull: ett tryck bredvid lämnar läget, ångra finns alltid, och OK i
                sifferblocket (eller Enter) sparar ett skrivet mått. */}
            {!pushpullBox && (
              <span className="ml-auto flex items-center gap-1.5">
                {(op || amend) && (
                  <Tip
                    label={op ? 'Avbryt' : amend ? 'Ångra' : 'Inget att avbryta'}
                    keys={op ? 'Esc' : amend ? '⌘Z' : undefined}
                    side="top"
                  >
                    <button
                      type="button"
                      aria-label={op ? 'Avbryt' : 'Ångra'}
                      disabled={!op && !amend}
                      onClick={op ? cancel : undoLast}
                      className={`${iconAction} text-muted hover:bg-hover disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`}
                    >
                      <X size={18} strokeWidth={2} aria-hidden />
                    </button>
                  </Tip>
                )}
                {/* Med sifferblocket öppet finns OK där; två likadana knappar vore förvirrande. Osynlig men kvar,
                  så att inget flyttar sig. */}
                <Tip label="OK" keys="Enter" side="top">
                  <button
                    type="submit"
                    aria-label="OK"
                    aria-hidden={numpadOpen || undefined}
                    tabIndex={numpadOpen ? -1 : undefined}
                    className={`${okButton} ${numpadOpen ? 'invisible' : ''}`}
                  >
                    <Check size={18} strokeWidth={2.25} aria-hidden />
                  </button>
                </Tip>
              </span>
            )}
          </form>
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <p className="max-w-96 px-1 text-[13px] text-muted">{hint}</p>
          {copyToggle}
          {/* Push/pull- och Flytta-läget har ingen knapp i verktygsraden att gå tillbaka med. */}
          {(tool === 'pushpull' || tool === 'move') && <DoneButton onClick={() => setTool('select')} />}
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
    <div className={bottomBox}>
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
        <DoneButton onClick={onDone} />
      </div>
    </div>
  )
}
