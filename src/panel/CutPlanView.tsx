import { RotateCcw } from 'lucide-react'
import { useMemo, useRef } from 'react'
import {
  buildCutPlan,
  countSame,
  isPanel,
  purchaseList,
  stockNoun,
  type CutPlanGroup,
  type PlacedPiece,
} from '../model/cutPlan'
import { numberFormat } from '../model/numberFormat'
import type { Body, StockSize } from '../model/types'
import { materialColor } from '../scene/colors'
import { useDocumentStore } from '../store/documentStore'
import { CommitField } from './CommitField'
import { plainNumber } from './numberStep'
import { fieldLabel, ghostButton, groupTitle, toggleButton } from './ui'
import { useWidth } from './useWidth'

const num = numberFormat(1, true)
const plain = numberFormat(1)
const percent = new Intl.NumberFormat('sv-SE', { style: 'percent', maximumFractionDigits: 0 })

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('sv') + s.slice(1)

/** Lägsta höjd (px) på en ritad bräda, så att smala delar syns och går att trycka på. */
const MIN_BOARD_PX = 40
/** Ungefärlig bredd per tecken i etiketterna (11 px systemfont). */
const CHAR_PX = 6.2

/** Ett mått i mm som får vara 0 (sågblad, kapmån, rensad kant), eller ett felmeddelande. */
function parseAmount(text: string): number | string {
  const n = plainNumber(text)
  if (n === null) return 'Skriv ett mått i mm'
  if (n < 0) return 'Måttet kan inte vara negativt'
  return n
}

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
  const setOptions = useDocumentStore((s) => s.setStockOptions)
  const plan = useMemo(() => buildCutPlan(bodies, stock), [bodies, stock])
  const purchases = useMemo(() => purchaseList(plan), [plan])

  return (
    <div className="flex flex-col gap-6">
      {purchases.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-hover px-3 py-2.5">
          <h3 className={groupTitle}>Att köpa</h3>
          <ul className="flex flex-col gap-1 text-[13px]">
            {purchases.map((p) => (
              <li key={p.key} className="flex items-baseline gap-2">
                <span
                  className="size-2.5 shrink-0 self-center rounded-[3px] ring-1 ring-black/15 ring-inset"
                  style={{ background: materialColor(p.material) }}
                  aria-hidden
                />
                <span className="tabular-nums">{p.text}</span>
                {p.length && <span className="ml-auto text-xs text-muted tabular-nums">{p.length}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className={fieldLabel}>
          Sågblad
          <CommitField
            value={plain.format(plan.kerf)}
            inputMode="decimal"
            suffix="mm"
            onCommit={(text) => {
              const n = parseAmount(text)
              if (typeof n === 'string') return n
              setOptions({ kerf: n })
              return null
            }}
          />
        </label>
        <label className={fieldLabel}>
          Kapmån på längden
          <CommitField
            value={plain.format(plan.lengthAllowance)}
            inputMode="decimal"
            suffix="mm"
            onCommit={(text) => {
              const n = parseAmount(text)
              if (typeof n === 'string') return n
              setOptions({ lengthAllowance: n })
              return null
            }}
          />
        </label>
      </div>

      {plan.groups.map((g) => (
        <GroupView key={g.key} group={g} />
      ))}

      <p className="text-xs text-faint">
        Delarnas längd följer brädans och skivans längd, så att fibern går rätt. Alla snitt går tvärs över biten, som
        med bordsåg eller skivsåg. Den streckade linjen visar det som rensas bort, och kapmånen ingår i delarnas yta.
        Smala brädor ritas bredare än skalan. Tryck på en del för att välja den.
      </p>
    </div>
  )
}

function GroupView({ group: g }: { group: CutPlanGroup }) {
  const setStockSize = useDocumentStore((s) => s.setStockSize)
  const set = (patch: Partial<StockSize>) => setStockSize(g.key, { ...g.stock, ...patch })
  const panel = isPanel(g)
  const noun = stockNoun(panel, g.boards.length)
  const unit = panel ? 'Skiva' : 'Bräda'

  const sizeField = (label: string, key: 'length' | 'width' | 'trim') => (
    <label className={fieldLabel}>
      {label}
      <CommitField
        value={plain.format(g.stock[key])}
        inputMode="decimal"
        suffix="mm"
        onCommit={(text) => {
          const n = key === 'trim' ? parseAmount(text) : parseSize(text)
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

      <div className="grid grid-cols-3 gap-2">
        {sizeField('Längd', 'length')}
        {sizeField('Bredd', 'width')}
        {/* Skivor rensas runt om, massivt trä bara i ändarna (se defaultTrim). */}
        {sizeField(g.sheet ? 'Rensa kanter' : 'Kapa ändar', 'trim')}
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
          <BoardDrawing
            stock={g.stock}
            sheet={g.sheet}
            pieces={pieces}
            material={g.material}
            label={`${unit} ${i + 1}`}
          />
        </div>
      ))}
    </div>
  )
}

/**
 * En skiva eller bräda med delarna, i skala efter panelens bredd. En smal
 * bräda ritas högre än skalan (MIN_BOARD_PX), annars syns inte delarna. Det
 * som rensas bort avgränsas med en streckad linje.
 */
function BoardDrawing({
  stock,
  sheet,
  pieces,
  material,
  label,
}: {
  stock: StockSize & { trim: number }
  sheet: boolean
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
          {stock.trim > 0 && (
            <g fill="none" strokeDasharray="3 3" className="stroke-faint">
              {sheet ? (
                <rect
                  x={stock.trim * kx}
                  y={stock.trim * ky}
                  width={width - 2 * stock.trim * kx}
                  height={height - 2 * stock.trim * ky}
                />
              ) : (
                <>
                  <line x1={stock.trim * kx} x2={stock.trim * kx} y1={0} y2={height} />
                  <line x1={width - stock.trim * kx} x2={width - stock.trim * kx} y1={0} y2={height} />
                </>
              )}
            </g>
          )}
          {pieces.map((p) => {
            const x = p.x * kx
            const y = p.y * ky
            const w = p.w * kx
            const h = p.h * ky
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
