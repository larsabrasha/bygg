import { Plus, RotateCcw, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import {
  buildCutPlan,
  countSame,
  groupCount,
  nextStock,
  purchaseList,
  stockDims,
  stockNoun,
  type CutPlanGroup,
  type PlacedPiece,
  type StockLayout,
} from '../model/cutPlan'
import { numberFormat } from '../model/numberFormat'
import type { Body, StockSize } from '../model/types'
import { materialColor } from '../scene/colors'
import { useDocumentStore } from '../store/documentStore'
import { CommitField } from './CommitField'
import { plainNumber } from './numberStep'
import { fieldLabel, ghostButton, groupTitle, ICON, iconButton, toggleButton } from './ui'
import { useWidth } from './useWidth'

const num = numberFormat(1, true)
const plain = numberFormat(1)
const percent = new Intl.NumberFormat('sv-SE', { style: 'percent', maximumFractionDigits: 0 })
/** Förstoringen av en smal bräda: "3" eller "1,5". */
const stretchFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 })

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

/** "Bräda 22 × 95 × 2 400 · ändar 20": måttet och det som rensas bort, som det står i gruppen. */
function stockSummary(l: StockLayout, sheet: boolean): string {
  const { trim, rotate } = l.stock
  const parts = [`${capitalize(stockNoun(l.panel, 1))} ${stockDims(l)}`]
  if (trim > 0) parts.push(sheet ? `kanter ${num.format(trim)}` : `ändar ${num.format(trim)}`)
  if (sheet && rotate) parts.push('vrids fritt')
  if (l.boards.length === 0) parts.push('används inte')
  return parts.join(' · ')
}

/**
 * Kapschemat: kaplistans delar utlagda på skivor och brädor, med
 * giljotinsnitt (se model/guillotine). Överst det man ska köpa, sedan en grupp
 * per material och tjocklek. Lagermåtten och sågbladet står som en rad och
 * ändras först när man trycker på Ändra, så att schemat är lugnt att läsa.
 */
export function CutPlanView({ bodies }: { bodies: readonly Body[] }) {
  const stock = useDocumentStore((s) => s.doc.stock)
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
                  className="size-2.5 shrink-0 translate-y-px self-start rounded-[3px] ring-1 ring-black/15 ring-inset"
                  style={{ background: materialColor(p.material), marginTop: 3 }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 tabular-nums">
                  {p.text}
                  {/* Köps tjockare än delarna ritats. */}
                  {p.note && <span className="block text-xs text-muted">{p.note}</span>}
                </span>
                {p.length && (
                  <span className="shrink-0 text-xs whitespace-nowrap text-muted tabular-nums">{p.length}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <SawOptions kerf={plan.kerf} allowance={plan.lengthAllowance} />

      {plan.groups.map((g) => (
        <GroupView key={g.key} group={g} allowance={plan.lengthAllowance} />
      ))}

      <p className="text-xs text-faint">
        Fibern går längs brädan. Det streckade sågas bort. Tryck på en del för att se vilken det är.
      </p>
    </div>
  )
}

/** Sågbladet och kapmånen: en rad, och fälten när man trycker på Ändra. */
function SawOptions({ kerf, allowance }: { kerf: number; allowance: number }) {
  const setOptions = useDocumentStore((s) => s.setStockOptions)
  const [editing, setEditing] = useState(false)
  const field = (label: string, value: number, key: 'kerf' | 'lengthAllowance') => (
    <label className={fieldLabel}>
      {label}
      <CommitField
        value={plain.format(value)}
        inputMode="decimal"
        suffix="mm"
        onCommit={(text) => {
          const n = parseAmount(text)
          if (typeof n === 'string') return n
          setOptions({ [key]: n })
          return null
        }}
      />
    </label>
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 px-1.5 text-xs text-muted tabular-nums">
          Sågblad {num.format(kerf)} mm · {allowance > 0 ? `kapmån ${num.format(allowance)} mm` : 'ingen kapmån'}
        </span>
        <button className={ghostButton} aria-expanded={editing} onClick={() => setEditing(!editing)}>
          {editing ? 'Klar' : 'Ändra'}
        </button>
      </div>
      {editing && (
        <div className="grid grid-cols-2 gap-2">
          {field('Sågblad', kerf, 'kerf')}
          {field('Kapmån på längden', allowance, 'lengthAllowance')}
        </div>
      )}
    </div>
  )
}

function GroupView({ group: g, allowance }: { group: CutPlanGroup; allowance: number }) {
  const setStockSizes = useDocumentStore((s) => s.setStockSizes)
  const [editing, setEditing] = useState(false)
  const current = g.stocks.map((l) => l.stock)
  const save = (list: StockSize[]) => setStockSizes(g.key, list)
  const update = (i: number, patch: Partial<StockSize>) =>
    save(current.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const several = g.stocks.length > 1

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
          {groupCount(g)}
          {g.stocks.some((l) => l.boards.length > 0) && ` · ${percent.format(g.waste)} spill`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <ul className="min-w-0 flex-1 px-1.5 text-xs text-muted tabular-nums">
          {g.stocks.map((l, i) => (
            <li key={i}>{stockSummary(l, g.sheet)}</li>
          ))}
          {/* Standardmåtten är en gissning; det ska synas att de går att ändra till det man köper. */}
          {g.isDefault && <li className="text-faint">Förslag. Ändra till det du köper.</li>}
        </ul>
        <button className={ghostButton} aria-expanded={editing} onClick={() => setEditing(!editing)}>
          {editing ? 'Klar' : 'Ändra'}
        </button>
      </div>

      {editing && (
        <div className="flex flex-col gap-3 rounded-lg bg-hover/60 p-2">
          {g.stocks.map((l, i) => (
            <StockRow
              key={i}
              layout={l}
              sheet={g.sheet}
              showLabels={i === 0}
              onChange={(patch) => update(i, patch)}
              onRemove={several ? () => save(current.filter((_, j) => j !== i)) : undefined}
            />
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button className={ghostButton} onClick={() => save([...current, nextStock(g, allowance)])}>
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              Lägg till mått
            </button>
            {!g.isDefault && (
              <button className={ghostButton} onClick={() => setStockSizes(g.key, null)}>
                <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
                Standardmått
              </button>
            )}
          </div>
        </div>
      )}

      {g.moved.length > 0 && <LeftoverNote group={g} />}

      {g.tooBig.length > 0 && (
        <div className="flex flex-col items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          <p>
            Får inte plats på {several ? 'något av måtten' : `en hel ${stockNoun(g.stocks[0]!.panel, 1)}`}:{' '}
            {countSame(g.tooBig.map((p) => `${p.name} (${num.format(p.length)} × ${num.format(p.width)})`)).join(', ')}
          </p>
          {/* Ett tryck lägger till ett mått som räcker (nextStock), i stället för att man ska räkna ut det. */}
          <button
            className="cursor-pointer font-semibold underline underline-offset-2"
            onClick={() => save([...current, nextStock(g, allowance)])}
          >
            Lägg till ett mått som räcker
          </button>
        </div>
      )}

      {g.stocks.flatMap((l, si) =>
        l.boards.map((pieces, i) => {
          const unit = capitalize(stockNoun(l.panel, 1))
          // Med flera mått står bredden efter, så att man ser vilket mått brädan eller skivan är.
          const label = `${unit} ${i + 1}${several ? ` · ${num.format(l.stock.width)} bred` : ''}`
          return (
            <div key={`${si}-${i}`} className="flex flex-col gap-1">
              <BoardDrawing stock={l.stock} sheet={g.sheet} pieces={pieces} material={g.material} label={label} />
            </div>
          )
        }),
      )}
    </div>
  )
}

/**
 * Vilka delar som kapas ur spill på ett annat mått, och ett val att låta bli: det
 * är användarens sak att avgöra om en sockel får tas ur limfogsskivans spill eller
 * ska ha en egen bräda. Syns bara när spillet gör någon skillnad.
 */
function LeftoverNote({ group: g }: { group: CutPlanGroup }) {
  const setLeftover = useDocumentStore((s) => s.setLeftover)
  const names = countSame(g.moved.map((p) => p.name)).join(', ')
  const [first] = g.moved
  const to = first!.toPanel ? 'en skiva' : 'en bräda'
  const own = first!.fromPanel ? 'egen skiva' : 'egen bräda'
  const owns = first!.fromPanel ? 'egna skivor' : 'egna brädor'
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-lg bg-hover px-3 py-2 text-xs">
      <p className="text-muted">
        {g.leftover
          ? `${names} kapas ur spillet på ${to} i stället för ur en ${own}.`
          : `${names} kan kapas ur spillet på ${to} i stället för ur en ${own}.`}
      </p>
      <button
        className="cursor-pointer font-semibold text-accent underline underline-offset-2"
        onClick={() => setLeftover(g.key, !g.leftover)}
      >
        {g.leftover ? `Ta ${g.moved.length > 1 ? owns : `en ${own}`}` : 'Använd spillet'}
      </button>
    </div>
  )
}

/** Fälten för ett lagermått: längd, bredd och det som rensas bort, och vridning för skivmaterial. */
function StockRow({
  layout: l,
  sheet,
  showLabels,
  onChange,
  onRemove,
}: {
  layout: StockLayout
  sheet: boolean
  /** Etiketterna står bara över det första måttet; de följande har dem för skärmläsare. */
  showLabels: boolean
  onChange: (patch: Partial<StockSize>) => void
  /** Saknas när det är gruppens enda mått. */
  onRemove?: () => void
}) {
  const field = (label: string, key: 'length' | 'width' | 'trim') => (
    <label className={fieldLabel}>
      {showLabels && label}
      <CommitField
        label={showLabels ? undefined : label}
        value={plain.format(l.stock[key])}
        inputMode="decimal"
        suffix="mm"
        onCommit={(text) => {
          const n = key === 'trim' ? parseAmount(text) : parseSize(text)
          if (typeof n === 'string') return n
          onChange({ [key]: n })
          return null
        }}
      />
    </label>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
          {field('Längd', 'length')}
          {field('Bredd', 'width')}
          {/* Skivor rensas runt om, massivt trä bara i ändarna (se defaultTrim). */}
          {field(sheet ? 'Rensa kanter' : 'Kapa ändar', 'trim')}
        </div>
        {onRemove && (
          <button className={iconButton} aria-label="Ta bort måttet" onClick={onRemove}>
            <X {...ICON} />
          </button>
        )}
      </div>
      {sheet && (
        <button
          className={`${toggleButton} self-start`}
          aria-pressed={!!l.stock.rotate}
          onClick={() => onChange({ rotate: !l.stock.rotate })}
        >
          Vrid delar fritt
        </button>
      )}
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
  // Den valda delen står under brädan med namn och mått: små delar har ingen etikett, och på
  // pekskärm finns ingen tooltip.
  const chosen = pieces.find((p) => selection?.kind === 'body' && selection.id === p.bodyId)
  const ky = height / stock.width
  // Hur mycket bredden är förstorad; 1 när brädan eller skivan står i rätt proportioner.
  const stretch = width > 0 ? ky / kx : 1
  const fill = materialColor(material)

  return (
    <div ref={ref} className="flex w-full flex-col gap-1">
      <div className="flex items-baseline gap-2 px-1.5 text-xs tabular-nums">
        <span className="min-w-0 truncate text-muted">{label}</span>
        {stretch > 1.05 && (
          <span className="ml-auto shrink-0 whitespace-nowrap text-faint">
            bredden ritad ×{stretchFormat.format(stretch)}
          </span>
        )}
      </div>
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
      {chosen && (
        <p className="px-1.5 text-xs text-accent tabular-nums">
          {chosen.name} · {num.format(chosen.length)} × {num.format(chosen.width)} mm{chosen.rotated ? ' · vriden' : ''}
        </p>
      )}
    </div>
  )
}
