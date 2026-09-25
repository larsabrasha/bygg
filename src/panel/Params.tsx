import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { evaluateParams, isNameUsed } from '../model/params'
import type { Param } from '../model/types'
import { useDocumentStore } from '../store/documentStore'
import { field, secondaryButton, sectionTitle } from './ui'
import { ExprInput } from './ExprInput'
import { useDraft } from './useDraft'
import { useSelectAll } from './useSelectAll'
import { Tip } from './Tip'
import { numberFormat } from '../model/numberFormat'

const fmt = numberFormat(2)

function ParamRow({
  param,
  error,
  used,
  autoFocus,
}: {
  param: Param
  error?: string
  used: boolean
  /** En ny parameter: namnet får fokus och är markerat, så att man kan skriva sitt eget direkt. */
  autoFocus: boolean
}) {
  const updateParam = useDocumentStore((s) => s.updateParam)
  const deleteParam = useDocumentStore((s) => s.deleteParam)
  const [name, setName] = useDraft(param.name)
  const [expr, setExpr] = useDraft(param.expr)
  const [message, setMessage] = useState<string | null>(null)
  const selectAll = useSelectAll()

  const save = (patch: { name?: string; expr?: string }) => {
    const e = updateParam(param.id, patch)
    setMessage(e)
    // Vid fel: visa felet men behåll texten, så att man kan rätta den.
  }

  const onKey = (reset: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      reset()
      setMessage(null)
    }
  }

  const shownError = message ?? error
  const computed = param.expr.trim() === fmt.format(param.value) ? null : `= ${fmt.format(param.value)} mm`
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2">
      <input
        className={`${field} font-medium`}
        aria-label="Namn"
        value={name}
        autoFocus={autoFocus}
        {...selectAll}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          selectAll.onBlur()
          if (name !== param.name) save({ name })
        }}
        onKeyDown={onKey(() => setName(param.name))}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <ExprInput
          className={`${field} tabular-nums ${shownError ? 'border-danger' : ''}`}
          aria-label="Värde eller uttryck"
          value={expr}
          inputMode="decimal"
          badges
          padX="px-[11px]"
          exclude={param.name}
          onChange={setExpr}
          onStep={(t) => save({ expr: t })}
          onBlur={() => expr !== param.expr && save({ expr })}
          onKeyDown={onKey(() => setExpr(param.expr))}
        />
        {shownError ? (
          <span className="text-xs text-danger">{shownError}</span>
        ) : (
          computed && <span className="text-xs text-accent">{computed}</span>
        )}
      </div>
      {/* En avstängd knapp får inga pekarhändelser; spannet runt tar emot hovringen så att förklaringen syns. */}
      <Tip label={used ? 'Används – ta bort användningen först' : 'Ta bort'}>
        <span className="shrink-0">
          <button
            className="grid size-10 cursor-pointer place-items-center rounded-lg text-muted hover:bg-hover disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent narrow:size-11"
            aria-label={`Ta bort ${param.name}`}
            disabled={used}
            onClick={() => deleteParam(param.id)}
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </span>
      </Tip>
    </li>
  )
}

export function Params() {
  const doc = useDocumentStore((s) => s.doc)
  const addParam = useDocumentStore((s) => s.addParam)
  const results = evaluateParams(doc.params)
  // Den som just lades till med knappen; inte de som fanns när panelen ritades första gången.
  const [added, setAdded] = useState<string | null>(null)

  return (
    <section className="group-data-[tab=cutlist]/sheet:hidden group-data-[tab=properties]/sheet:hidden">
      <h2 className={sectionTitle}>Parametrar</h2>
      <div className="flex flex-col gap-2.5">
        <>
          <p className="text-[13px] text-muted">
            Mått med namn, som <code>tjocklek = 22</code>. Skriv namnet i en dels mått, så ändras delen när du ändrar
            värdet här.
          </p>
          {doc.params.length > 0 && (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 text-xs text-muted narrow:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem]">
                <span>Namn</span>
                <span>Värde (mm)</span>
              </div>
              <ul className="flex flex-col gap-2">
                {doc.params.map((p) => {
                  const r = results.get(p.id)
                  const others = { ...doc, params: doc.params.filter((x) => x.id !== p.id) }
                  return (
                    <ParamRow
                      key={p.id}
                      param={p}
                      error={r && !r.ok ? r.error : undefined}
                      used={isNameUsed(others, p.name)}
                      autoFocus={p.id === added}
                    />
                  )
                })}
              </ul>
            </>
          )}
          <button className={`${secondaryButton} self-start`} onClick={() => setAdded(addParam())}>
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            Ny parameter
          </button>
        </>
      </div>
    </section>
  )
}
