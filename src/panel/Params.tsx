import { useState } from 'react'
import { evaluateParams, isNameUsed } from '../model/params'
import type { Param } from '../model/types'
import { useDocumentStore } from '../store/documentStore'
import { field, secondaryButton, sectionTitle } from './ui'
import { useDraft } from './useDraft'

const fmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2, useGrouping: false })

function ParamRow({ param, error, used }: { param: Param; error?: string; used: boolean }) {
  const updateParam = useDocumentStore((s) => s.updateParam)
  const deleteParam = useDocumentStore((s) => s.deleteParam)
  const [name, setName] = useDraft(param.name)
  const [expr, setExpr] = useDraft(param.expr)
  const [message, setMessage] = useState<string | null>(null)

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
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5">
      <input
        className={field}
        aria-label="Namn"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== param.name && save({ name })}
        onKeyDown={onKey(() => setName(param.name))}
      />
      <input
        className={`${field} ${shownError ? 'border-danger' : ''}`}
        aria-label="Värde eller uttryck"
        value={expr}
        inputMode="decimal"
        onChange={(e) => setExpr(e.target.value)}
        onBlur={() => expr !== param.expr && save({ expr })}
        onKeyDown={onKey(() => setExpr(param.expr))}
      />
      <button
        className="min-h-8 cursor-pointer rounded px-2 text-muted disabled:cursor-default disabled:opacity-40 narrow:min-h-11"
        title={used ? 'Används – ta bort användningen först' : 'Ta bort'}
        aria-label={`Ta bort ${param.name}`}
        disabled={used}
        onClick={() => deleteParam(param.id)}
      >
        ✕
      </button>
      <span className={`col-span-3 -mt-1 text-xs ${shownError ? 'text-danger' : 'text-faint'}`}>
        {shownError ?? (param.expr.trim() === fmt.format(param.value) ? '' : `= ${fmt.format(param.value)} mm`)}
      </span>
    </li>
  )
}

export function Params() {
  const doc = useDocumentStore((s) => s.doc)
  const addParam = useDocumentStore((s) => s.addParam)
  const results = evaluateParams(doc.params)

  return (
    <section className="narrow:group-data-[tab=cutlist]/sheet:hidden narrow:group-data-[tab=properties]/sheet:hidden">
      <h2 className={sectionTitle}>Parametrar</h2>
      {doc.params.length === 0 ? (
        <p className="mb-2 text-faint">
          Namngivna mått, t.ex. <code>tjocklek = 22</code>. Skriv namnet i ett mått, så följer det med när du ändrar
          värdet här.
        </p>
      ) : (
        <ul className="mb-2 flex flex-col gap-2">
          {doc.params.map((p) => {
            const r = results.get(p.id)
            const others = { ...doc, params: doc.params.filter((x) => x.id !== p.id) }
            return (
              <ParamRow
                key={p.id}
                param={p}
                error={r && !r.ok ? r.error : undefined}
                used={isNameUsed(others, p.name)}
              />
            )
          })}
        </ul>
      )}
      <button className={secondaryButton} onClick={addParam}>
        + Ny parameter
      </button>
    </section>
  )
}
