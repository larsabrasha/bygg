import { applyMeasure, cancel, liveMeasure } from '../tools/actions'
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

  if (tool === 'select') return null

  const hint = !op
    ? {
        rect: 'Tryck där första hörnet ska vara – på golvet eller på en yta.',
        pushpull: 'Tryck på en skiss eller en sida av en del.',
        move: 'Tryck på en del. Den flyttas i planet för sidan du trycker på.',
      }[tool]
    : {
        rect: 'Tryck på andra hörnet, eller skriv längd och bredd.',
        pushpull: 'Dra längs pilen, eller skriv avståndet.',
        move: 'Dra dit delen ska, eller skriv avståndet.',
      }[op.kind]

  const live = op ? liveMeasure(op) : []
  const labels = op?.kind === 'rect' ? ['Längd', 'Bredd'] : ['Avstånd']

  return (
    <div className="absolute bottom-3 left-1/2 w-max max-w-[calc(100%-24px)] -translate-x-1/2 rounded-lg border border-line bg-panel/95 px-2.5 py-2 shadow-md">
      <p className="text-[13px] text-muted">{hint}</p>
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
              <span className="absolute right-1.5 bottom-1.5 text-unit narrow:bottom-3">mm</span>
            </label>
          ))}
          <button type="submit" className={primaryButton}>
            OK
          </button>
          <button type="button" className={secondaryButton} onClick={cancel}>
            Avbryt
          </button>
        </form>
      )}
    </div>
  )
}
