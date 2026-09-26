import { useMemo, type ReactNode } from 'react'
import type { CutListRow } from '../model/cutlist'
import { compactNames } from '../model/cutlistExport'
import { numberFormat } from '../model/numberFormat'
import {
  layoutPartSheet,
  scaleLabel,
  SHEET,
  type PartGeometry,
  type SheetBreak,
  type SheetDetail,
  type SheetDim,
  type SheetLine,
  type SheetShape,
} from '../model/partSheet'

const num = numberFormat(1, true)

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('sv') + s.slice(1)

/** Linjebredder i mm, som på en ritning: grova för synliga kanter, fina för mått. */
const THICK = 0.5
const THIN = 0.25
const HIDDEN = 0.3
const ARROW = 2.5
/** Måttens text, 2,8 mm (8 pt); dimRows i partSheet.ts räknar med samma storlek. */
const TEXT = 2.8

interface Props {
  pos: number
  row: CutListRow
  geometry: PartGeometry
  modelName: string
  date: string
  sheet: number
  sheets: number
}

/**
 * Detaljblad för en position: tre vyer med mått, i en SVG med millimeter som
 * enhet. Skrivs bladet ut 287 mm brett stämmer skalan på papperet.
 */
export function PartSheet({ pos, row, geometry, modelName, date, sheet, sheets }: Props) {
  const layout = useMemo(() => layoutPartSheet(geometry), [geometry])
  const [L, B, T] = geometry.size
  const names = compactNames(row.names) + (row.round ? ` (rund, Ø ${num.format(row.round.diameter)})` : '')

  return (
    <SheetSvg
      label={`Detaljblad för position ${pos}, ${names}`}
      note="Mått i mm. L längs fibern. Projektion enligt E-metoden."
      cells={[
        { dx: 0, dy: 0, w: 95, h: 12, label: 'Benämning', value: names, size: 4, bold: true },
        { dx: 95, dy: 0, w: 30, h: 12, label: 'Pos', value: String(pos), size: 6, bold: true },
        { dx: 0, dy: 12, w: 40, h: 9, label: 'Material', value: capitalize(row.material) },
        { dx: 40, dy: 12, w: 25, h: 9, label: 'Antal', value: `${row.count} st` },
        {
          dx: 65,
          dy: 12,
          w: 60,
          h: 9,
          label: 'Ämne L × B × T',
          value: `${num.format(L)} × ${num.format(B)} × ${num.format(T)}`,
        },
        { dx: 0, dy: 21, w: 50, h: 9, label: 'Modell', value: modelName },
        { dx: 50, dy: 21, w: 25, h: 9, label: 'Datum', value: date, size: 3 },
        { dx: 75, dy: 21, w: 20, h: 9, label: 'Skala', value: scaleLabel(layout.scale) },
        { dx: 95, dy: 21, w: 30, h: 9, label: 'Blad', value: `${sheet} (${sheets})` },
      ]}
    >
      {layout.shapes.map((s, i) => (
        <Shape key={i} shape={s} />
      ))}
      {layout.lines.map((l, i) => (
        <Line key={i} line={l} />
      ))}
      {layout.breaks.map((b, i) => (
        <Break key={i} brk={b} />
      ))}
      {layout.dims.map((d, i) => (
        <Dim key={i} dim={d} />
      ))}
      {layout.details.map((d) => (
        <Detail key={d.letter} detail={d} pos={pos} />
      ))}
    </SheetSvg>
  )
}

/** En ruta i titelrutan, räknat från titelrutans övre vänstra hörn. */
export interface TitleCell {
  dx: number
  dy: number
  w: number
  h: number
  label: string
  value: string
  size?: number
  bold?: boolean
}

/**
 * Ett blad som SVG med millimeter som enhet: ram, en rad anteckningar nere
 * till vänster och titelrutan nere till höger. Skrivs bladet ut 287 mm brett
 * stämmer skalan på papperet.
 */
export function SheetSvg({
  label,
  note,
  cells,
  children,
}: {
  label: string
  note: string
  cells: readonly TitleCell[]
  children: ReactNode
}) {
  const x = SHEET.width - SHEET.frame - SHEET.title.width
  const y = SHEET.height - SHEET.frame - SHEET.title.height
  return (
    <svg
      viewBox={`0 0 ${SHEET.width} ${SHEET.height}`}
      className="block size-full"
      role="img"
      aria-label={label}
      fill="none"
      stroke="black"
      strokeLinecap="round"
    >
      <rect
        x={SHEET.frame}
        y={SHEET.frame}
        width={SHEET.width - 2 * SHEET.frame}
        height={SHEET.height - 2 * SHEET.frame}
        strokeWidth={0.7}
      />
      {children}
      <text x={SHEET.frame + 4} y={SHEET.height - SHEET.frame - 3} fontSize={2.5} fill="#333" stroke="none">
        {note}
      </text>
      {cells.map((c) => (
        <Cell key={c.label} {...c} x={x + c.dx} y={y + c.dy} />
      ))}
    </svg>
  )
}

function Shape({ shape: s }: { shape: SheetShape }) {
  const stroke = s.style === 'hidden' ? { strokeWidth: HIDDEN, strokeDasharray: '2 1' } : { strokeWidth: THICK }
  return s.kind === 'ellipse' ? (
    <ellipse cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} {...stroke} />
  ) : (
    <rect x={s.x} y={s.y} width={s.w} height={s.h} {...stroke} />
  )
}

function Line({ line: l }: { line: SheetLine }) {
  return <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} strokeWidth={THIN} strokeDasharray="4 1 0.6 1" />
}

/**
 * En förstoring: området ur vyn, klippt vid kanterna, med egna mått och
 * rubriken "A (2:1)" under. I vyn det kommer från en tunn ring med bokstaven.
 */
function Detail({ detail: d, pos }: { detail: SheetDetail; pos: number }) {
  const clipId = `detalj-${pos}-${d.letter}`
  const c = d.clip
  return (
    <g>
      <clipPath id={clipId}>
        <rect x={c.x - 0.4} y={c.y - 0.4} width={c.w + 0.8} height={c.h + 0.8} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {d.shapes.map((s, i) => (
          <Shape key={i} shape={s} />
        ))}
        {d.lines.map((l, i) => (
          <Line key={i} line={l} />
        ))}
      </g>
      {d.dims.map((dim, i) => (
        <Dim key={i} dim={dim} />
      ))}
      <text x={d.label.x} y={d.label.y} fontSize={3.2} fontWeight={600} fill="black" stroke="none">
        {d.letter} ({scaleLabel(d.scale)})
      </text>
      <circle cx={d.mark.cx} cy={d.mark.cy} r={d.mark.r} strokeWidth={THIN} />
      <text
        x={d.mark.cx + d.mark.r * 0.75}
        y={d.mark.cy - d.mark.r * 0.75 - 0.8}
        fontSize={3.2}
        fontWeight={600}
        fill="black"
        stroke="none"
      >
        {d.letter}
      </text>
    </g>
  )
}

/**
 * Avbrott i en lång del: en vit remsa över konturen och en sicksacklinje på var
 * sida, som på en ritning. Det som saknas är slätt; måtten visar hela längden.
 */
function Break({ brk: b }: { brk: SheetBreak }) {
  const half = 1.2
  const zigzag = (x: number) => {
    const steps = Math.max(2, Math.round(b.h / 3))
    const pts = Array.from({ length: steps + 1 }, (_, i) => {
      const y = b.y - 1.5 + ((b.h + 3) * i) / steps
      return `${x + (i % 2 === 0 ? -0.6 : 0.6)},${y}`
    })
    return pts.join(' ')
  }
  return (
    <g>
      <rect x={b.x - half} y={b.y - 1} width={2 * half} height={b.h + 2} fill="white" stroke="none" />
      <polyline points={zigzag(b.x - half)} strokeWidth={THIN} />
      <polyline points={zigzag(b.x + half)} strokeWidth={THIN} />
    </g>
  )
}

/** Måttlinje med pilar, hjälplinjer och text. Är den för kort står pilarna utanför och pekar in. */
export function Dim({ dim: d }: { dim: SheetDim }) {
  const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1
  const ux = (d.x2 - d.x1) / len
  const uy = (d.y2 - d.y1) / len
  const out = d.arrowsOut ? -1 : 1
  const arrow = (x: number, y: number, dir: number) => {
    const bx = x + ux * ARROW * dir * out
    const by = y + uy * ARROW * dir * out
    const w = ARROW * 0.3
    return `${x},${y} ${bx - uy * w},${by + ux * w} ${bx + uy * w},${by - ux * w}`
  }
  // Pilar utanför: måttlinjen fortsätter förbi dem.
  const extra = d.arrowsOut ? ARROW + 1.5 : 0
  return (
    <g strokeWidth={THIN}>
      {d.ext.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
      <line x1={d.x1 - ux * extra} y1={d.y1 - uy * extra} x2={d.x2 + ux * extra} y2={d.y2 + uy * extra} />
      <polygon points={arrow(d.x1, d.y1, 1)} fill="black" stroke="none" />
      <polygon points={arrow(d.x2, d.y2, -1)} fill="black" stroke="none" />
      <text
        x={d.tx}
        y={d.ty}
        fontSize={TEXT}
        fontWeight={500}
        textAnchor="middle"
        fill="black"
        stroke="none"
        transform={d.vertical ? `rotate(-90 ${d.tx} ${d.ty})` : undefined}
      >
        {d.text}
      </text>
    </g>
  )
}

/** Kortar en text som inte ryms i rutan, ungefär (tecknens bredd i mm är ungefär 0,55 × storleken). */
const fit = (text: string, width: number, size: number) => {
  const max = Math.floor((width - 2) / (size * 0.55))
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text
}

function Cell({ x, y, w, h, label, value, size = 3.2, bold = false }: TitleCell & { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} strokeWidth={0.35} />
      <text x={x + 1.2} y={y + 2.9} fontSize={2.1} fill="#333" stroke="none" letterSpacing={0.12}>
        {label.toLocaleUpperCase('sv')}
      </text>
      <text x={x + 1.2} y={y + h - 1.8} fontSize={size} fontWeight={bold ? 600 : 400} fill="black" stroke="none">
        {fit(value, w, size)}
      </text>
    </g>
  )
}
