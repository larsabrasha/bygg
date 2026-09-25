import { applyMeasure, cancel, liveMeasure, repeatLastPushPull } from '../tools/actions'
import { useToolStore } from '../store/toolStore'
import { primaryButton, secondaryButton } from './ui'

const fmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1, useGrouping: false })

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

  // I Välj syns rutan bara under en operation (pilen eller "Dra ut").
  if (tool === 'select' && !op) return null

  const hint = !op
    ? {
        select: '',
        rect: 'Tryck där första hörnet ska vara – på golvet eller på en yta.',
        pushpull: 'Dra i en skiss eller en sida av en del, eller tryck på den.',
        move: 'Dra i en pil för att flytta längs X, Y eller Z, eller i en båge för att vrida. Du kan också dra i själva delen.',
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

  const live = op ? liveMeasure(op) : []
  const labels =
    op?.kind === 'rect'
      ? ['Längd', 'Bredd']
      : op?.kind === 'rotate'
        ? [`Vinkel runt ${'XYZ'[op.axis]}`]
        : op?.kind === 'move' && op.axis !== null
          ? [`Avstånd ${'XYZ'[op.axis]}`]
          : ['Avstånd']
  const unit = op?.kind === 'rotate' ? '°' : 'mm'

  return (
    <div className="absolute bottom-3 left-1/2 w-max max-w-[calc(100%-24px)] -translate-x-1/2 rounded-lg border border-line bg-panel/95 px-2.5 py-2 shadow-md">
      <div className="flex items-center gap-2">
        <p className="text-[13px] text-muted">{hint}</p>
        {/* Push/pull- och Flytta-läget har ingen knapp i verktygsraden att gå tillbaka med. */}
        {!op && (tool === 'pushpull' || tool === 'move') && (
          <button type="button" className={secondaryButton} onClick={() => setTool('select')}>
            Klar
          </button>
        )}
      </div>
      {op && (
        <form
          className="mt-1.5 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            applyMeasure()
          }}
        >
          {labels.map((label, i) => (
            <label key={label} className="relative flex flex-col text-xs text-muted">
              {label}
              <input
                inputMode="decimal"
                enterKeyHint="done"
                value={measure[i]}
                placeholder={fmt.format(live[i] ?? 0)}
                onChange={(e) => setMeasure(i as 0 | 1, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancel()
                }}
                className="w-24 rounded border border-line bg-field py-1 pr-7 pl-1.5 text-ink tabular-nums narrow:min-h-11 narrow:w-22"
              />
              <span className="absolute right-1.5 bottom-1.5 text-unit narrow:bottom-3">{unit}</span>
            </label>
          ))}
          <button type="submit" className={primaryButton}>
            OK
          </button>
          <button type="button" className={secondaryButton} onClick={cancel}>
            Avbryt
          </button>
          {op.kind === 'pushpull' && last && (
            <button
              type="button"
              className={secondaryButton}
              title="Samma djup som förra gången (eller dubbeltryck)"
              onClick={repeatLastPushPull}
            >
              Som förra: {last.expr ?? `${fmt.format(last.distance)} mm`}
            </button>
          )}
        </form>
      )}
    </div>
  )
}
