import { RotateCcw } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { buildCutPlan, countSame, isPanel, type CutPlanGroup, type PlacedPiece } from '../model/cutPlan'
import { numberFormat } from '../model/numberFormat'
import type { Body, StockSize } from '../model/types'
import { materialColor } from '../scene/colors'
import { useDocumentStore } from '../store/documentStore'
import { CommitField } from './CommitField'
import { plainNumber } from './numberStep'
import { fieldLabel, ghostButton, toggleButton } from './ui'
import { useWidth } from './useWidth'

const num = numberFormat(1, true)
const plain = numberFormat(1)
const percent = new Intl.NumberFormat('sv-SE', { style: 'percent', maximumFractionDigits: 0 })

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('sv') + s.slice(1)

/** Lägsta höjd (px) på en ritad bräda, så att smala delar syns och går att trycka på. */
const MIN_BOARD_PX = 40
/** Ungefärlig bredd per tecken i etiketterna (11 px systemfont). */
const CHAR_PX = 6.2

/** Ett mått i mm, eller ett felmeddelande. */
function parseSize(text: string): number | string {
  const n = plainNumber(text)
  if (n === null) return 'Skriv ett mått i mm'
  if (n <= 0) return 'Måttet måste vara större än 0'
  return n
}

/**
 * Kapschemat: kaplistans delar utlagda på skivor och brädor, med
 * giljotinsnitt (se model/guillotine). Lagermåtten ställs in per material och
 * tjocklek och sparas med modellen.
 */
export function CutPlanView({ bodies }: { bodies: readonly Body[] }) {
  const stock = useDocumentStore((s) => s.doc.stock)
  const setKerf = useDocumentStore((s) => s.setKerf)
  const plan = useMemo(() => buildCutPlan(bodies, stock), [bodies, stock])

  return (
    <div className="flex flex-col gap-6">
      <label className={`${fieldLabel} max-w-40`}>
        Sågblad
        <CommitField
          value={plain.format(plan.kerf)}
          inputMode="decimal"
          suffix="mm"
          onCommit={(text) => {
            const n = plainNumber(text)
            if (n === null || n < 0) return 'Skriv bladets bredd i mm'
            setKerf(n)
            return null
          }}
        />
      </label>

      {plan.groups.map((g) => (
        <GroupView key={g.key} group={g} />
      ))}

      <p className="text-xs text-faint">
        Delarnas längd följer brädans och skivans längd, så att fibern går rätt. Alla snitt går tvärs över biten, som
        med bordsåg eller skivsåg. Smala brädor ritas bredare än skalan. Tryck på en del för att välja den.
      </p>
    </div>
  )
}

function GroupView({ group: g }: { group: CutPlanGroup }) {
  const setStockSize = useDocumentStore((s) => s.setStockSize)
  const set = (patch: Partial<StockSize>) => setStockSize(g.key, { ...g.stock, ...patch })
  const panel = isPanel(g)
  const noun = panel ? (g.boards.length === 1 ? 'skiva' : 'skivor') : g.boards.length === 1 ? 'bräda' : 'brädor'
  const unit = panel ? 'Skiva' : 'Bräda'

  const sizeField = (label: string, key: 'length' | 'width') => (
    <label className={fieldLabel}>
      {label}
      <CommitField
        value={plain.format(g.stock[key])}
        inputMode="decimal"
        suffix="mm"
        onCommit={(text) => {
          const n = parseSize(text)
          if (typeof n === 'string') return n
          set({ [key]: n })
          return null
        }}
      />
    </label>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1.5">
        <span
          className="size-3 shrink-0 rounded-[3px] ring-1 ring-black/15 ring-inset"
          style={{ background: materialColor(g.material) }}
          aria-hidden
        />
        <h3 className="text-[13px] font-semibold">
          {capitalize(g.material)} {num.format(g.thickness)} mm
        </h3>
        <span className="ml-auto text-xs text-muted tabular-nums">
          {g.boards.length} {noun}
          {g.boards.length > 0 && ` · ${percent.format(g.waste)} spill`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {sizeField(`${unit}, längd`, 'length')}
        {sizeField(`${unit}, bredd`, 'width')}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {g.sheet && (
          <button
            className={toggleButton}
            aria-pressed={!!g.stock.rotate}
            onClick={() => set({ rotate: !g.stock.rotate })}
          >
            Vrid delar fritt
          </button>
        )}
        {g.isDefault ? (
          <span className="px-1.5 text-xs text-faint">Gissat mått. Ändra till det du köper.</span>
        ) : (
          <button className={ghostButton} onClick={() => setStockSize(g.key, null)}>
            <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
            Standardmått
          </button>
        )}
      </div>

      {g.tooBig.length > 0 && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          Får inte plats på en hel {unit.toLowerCase()}:{' '}
          {countSame(g.tooBig.map((p) => `${p.name} (${num.format(p.length)} × ${num.format(p.width)})`)).join(', ')}
        </p>
      )}

      {g.boards.map((pieces, i) => (
        <div key={i} className="flex flex-col gap-1">
          <span className="px-1.5 text-xs text-muted">
            {unit} {i + 1}
          </span>
          <BoardDrawing stock={g.stock} pieces={pieces} material={g.material} label={`${unit} ${i + 1}`} />
        </div>
      ))}
    </div>
  )
}

/**
 * En skiva eller bräda med delarna, i skala efter panelens bredd. En smal
 * bräda ritas högre än skalan (MIN_BOARD_PX), annars syns inte delarna.
 */
function BoardDrawing({
  stock,
  pieces,
  material,
  label,
}: {
  stock: StockSize
  pieces: readonly PlacedPiece[]
  material: string
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const selection = useDocumentStore((s) => s.selection)
  const select = useDocumentStore((s) => s.select)

  const kx = width / stock.length
  const height = Math.max(stock.width * kx, MIN_BOARD_PX)
  const ky = height / stock.width
  const fill = materialColor(material)

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
          <rect x={0.5} y={0.5} width={width - 1} height={height - 1} rx={2} className="fill-hover stroke-line" />
          {pieces.map((p) => {
            const x = p.x * kx
            const y = p.y * ky
            const w = p.length * kx
            const h = p.width * ky
            const selected = selection?.kind === 'body' && selection.id === p.bodyId
            const showName = h >= 14 && w >= p.name.length * CHAR_PX + 8
            return (
              <g key={p.bodyId} className="cursor-pointer" onClick={() => select({ kind: 'body', id: p.bodyId })}>
                <title>{`${p.name}: ${num.format(p.length)} × ${num.format(p.width)} mm${p.rotated ? ', vriden' : ''}`}</title>
                <rect
                  x={x}
                  y={y}
                  width={Math.max(w, 1)}
                  height={Math.max(h, 1)}
                  fill={fill}
                  className={selected ? 'stroke-accent' : 'stroke-black/25'}
                  strokeWidth={selected ? 2 : 0.75}
                />
                {showName && (
                  <text
                    x={x + w / 2}
                    y={y + h / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fill="#2a2724"
                    className="pointer-events-none select-none"
                  >
                    {p.name}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
