import { useCallback, useRef, useState } from 'react'
import { AXES, extent, widthAxis } from '../model/partAxes'
import type { Axis, Body, PartDef } from '../model/types'
import { dimensionsFor, registerLabel } from '../scene/dimensionLabels'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { ExprInput } from './ExprInput'
import { Tip } from './Tip'
import { numberFormat } from '../model/numberFormat'

const fmt = numberFormat(1)

function DimensionLabel({
  body,
  def,
  axis,
  live,
  changing,
}: {
  body: Body
  def: PartDef
  axis: Axis
  /** Under push/pull: bara visa, inte ändra. */
  live: boolean
  /** Måttet som ändras just nu; markeras. */
  changing: boolean
}) {
  const setExtent = useDocumentStore((s) => s.setExtent)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Samma funktion varje gång, annars avregistreras och registreras etiketten vid varje omritning.
  const register = useCallback((el: HTMLDivElement | null) => registerLabel(axis, el), [axis])

  const [letter, name] = labelOf(def, axis)
  const size = extent(body, axis)
  const expr = def.dims?.[axis]?.expr
  const current = expr ?? fmt.format(size)

  // Enter sparar och stänger; fältet kan då få blur också, och det ska inte spara en gång till.
  const open = useRef(false)
  const close = () => {
    open.current = false
    setEditing(false)
    setError(null)
  }
  const save = () => {
    if (!open.current) return
    if (text.trim() === '' || text === current) return close()
    const e = setExtent(body.id, axis, text)
    if (e) setError(e)
    else close()
  }

  return (
    // Läget sätts av DimensionGuides i 3D-vyn; osynlig tills den placerat etiketten.
    <div ref={register} className="invisible absolute top-0 left-0">
      {live ? (
        // Går inte att trycka på: trycket ska gå till 3D-vyn, där man avslutar push/pull.
        <span
          className={`pointer-events-none flex h-7 items-center gap-1 rounded-lg border px-2 whitespace-nowrap shadow-md narrow:h-9 ${changing ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-panel/95 text-ink'}`}
        >
          <span className={`text-[11px] font-semibold ${changing ? '' : 'text-muted'}`}>{letter}</span>
          <span className="text-[13px] font-semibold tabular-nums">{fmt.format(size)}</span>
        </span>
      ) : editing ? (
        <span className="flex flex-col items-center gap-1">
          <span
            data-field-box
            className={`flex h-8 items-center gap-1 rounded-lg border bg-field pr-2 pl-2 shadow-md ring-2 narrow:h-10 ${error ? 'border-danger ring-danger-soft' : 'border-accent ring-accent-soft'}`}
          >
            <span className="text-[11px] font-semibold text-muted">{letter}</span>
            <ExprInput
              autoFocus
              aria-label={name}
              aria-invalid={!!error}
              inputMode="decimal"
              enterKeyHint="done"
              value={text}
              onChange={(t) => {
                setText(t)
                setError(null)
              }}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') close()
              }}
              padX="px-0"
              wrapperClass="block"
              className="w-24 bg-transparent text-[13px] font-semibold text-ink tabular-nums outline-none"
            />
            <span className="text-xs text-unit">mm</span>
          </span>
          {error && (
            <span className="rounded-md bg-panel px-1.5 py-0.5 text-xs whitespace-nowrap text-danger shadow">
              {error}
            </span>
          )}
        </span>
      ) : (
        <Tip label={expr ? `${name} = ${expr}` : `${name}: klicka för att ändra`} side="top">
          <button
            type="button"
            aria-label={`${name} ${fmt.format(size)} mm, ändra`}
            onClick={() => {
              setText(current)
              setEditing(true)
              open.current = true
            }}
            className="flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-line bg-panel/95 px-2 whitespace-nowrap shadow-md hover:border-accent narrow:h-9"
          >
            <span className="text-[11px] font-semibold text-muted">{letter}</span>
            <span className={`text-[13px] font-semibold tabular-nums ${expr ? 'text-accent' : 'text-ink'}`}>
              {fmt.format(size)}
            </span>
          </button>
        </Tip>
      )}
    </div>
  )
}

/** Bokstav och namn för en axel: L längs fibern, T tjockleken, B det som blir över. */
function labelOf(def: PartDef, axis: Axis): [string, string] {
  if (axis === def.grainAxis) return ['L', 'Längd']
  if (axis === def.thicknessAxis) return ['T', 'Tjocklek']
  return axis === widthAxis(def) ? ['B', 'Bredd'] : ['', '']
}

/**
 * Längd, bredd och tjocklek på den valda delen, vid kanterna i 3D-vyn (som i
 * Shapr3D). Tryck på ett mått för att skriva ett nytt; det tar uttryck med
 * parametrar, som fälten i detaljpanelen. Under push/pull visas delen som den
 * blir, utan att gå att ändra. Placeras av scene/DimensionGuides.
 */
export function DimensionLabels() {
  const doc = useDocumentStore((s) => s.doc)
  const selection = useDocumentStore((s) => s.selection)
  const tool = useToolStore((s) => s.tool)
  const op = useToolStore((s) => s.op)
  const target = dimensionsFor(doc, selection, tool, op)
  if (!target) return null
  return (
    <div key={target.body.id}>
      {AXES.map((axis) => (
        <DimensionLabel
          key={axis}
          body={target.body}
          def={target.def}
          axis={axis}
          live={target.live}
          changing={target.changing === axis}
        />
      ))}
    </div>
  )
}
