import { FileSpreadsheet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { buildCutList, groupByMaterial, paintText, type CutListRow } from '../model/cutlist'
import { compactNames, cutListCsv, safeFileName } from '../model/cutlistExport'
import { numberFormat } from '../model/numberFormat'
import { materialColor } from '../scene/colors'
import { useBodies, useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { deliverFile } from './fileOut'
import { EmptyState } from './EmptyState'
import { CutPlanView } from './CutPlanView'
import { CutListPicture } from './pictures'
import { ghostButton, groupTitle, listCard, sectionTitle, selectableListRow, segment, segmentGroup } from './ui'
import { firstUpper, isOrdered, materialTitle } from '../model/materials'

const num = numberFormat(1, true)
const volume = numberFormat(4, true)

// Kolumnerna har fast bredd utom namnet, så att måtten står i linje mellan materialen och raderna.
// Listan är ett grid i stället för en tabell: en tabellrad går inte att runda.
const cols = 'grid grid-cols-[2rem_minmax(0,1fr)_3rem_3rem_3rem] items-baseline [&>*]:px-1.5'
const dim = 'text-right tabular-nums'

export function CutList() {
  const bodies = useBodies()
  const cutList = useMemo(() => buildCutList(bodies), [bodies])
  const groups = useMemo(() => groupByMaterial(cutList.rows), [cutList])
  const [view, setView] = useState<'list' | 'plan'>('list')

  return (
    <section className="group-data-[tab=params]/sheet:hidden group-data-[tab=properties]/sheet:hidden">
      <h2 className={sectionTitle}>Kaplista</h2>
      {cutList.rows.length === 0 ? (
        <EmptyState picture={<CutListPicture />} title="Kaplistan är tom">
          Den fylls när du drar ut en skiss till en del. Varje del mäts i sin egen riktning: längd längs fibern, sedan
          bredd och tjocklek.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          <div className={segmentGroup} role="group" aria-label="Visa">
            {(
              [
                ['list', 'Lista'],
                ['plan', 'Kapschema'],
              ] as const
            ).map(([v, label]) => (
              <button key={v} className={segment} aria-pressed={view === v} onClick={() => setView(v)}>
                {label}
              </button>
            ))}
          </div>

          {view === 'plan' && <CutPlanView bodies={bodies} />}

          {view === 'list' &&
            groups.map((g) => (
              <div key={g.material} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 px-3">
                  <span
                    className="size-3 shrink-0 rounded-[3px] ring-1 ring-black/15 ring-inset"
                    style={{ background: materialColor(g.material) }}
                    aria-hidden
                  />
                  <h3 className="text-[13px] font-semibold">{materialTitle(g.material)}</h3>
                  <span className="ml-auto text-xs text-muted tabular-nums">
                    {/* Glas köps per ruta, inte per kubikmeter. */}
                    {g.count} st · {isOrdered(g.material) ? 'till mått' : `${volume.format(g.volumeM3)} m³`}
                  </span>
                </div>
                <div role="table" aria-label={materialTitle(g.material)} className="text-[13px]">
                  <div role="row" className={`${cols} ${groupTitle} px-1.5 py-1.5 [&>*]:font-semibold`}>
                    <span role="columnheader" className="text-right">
                      St
                    </span>
                    <span role="columnheader">Namn</span>
                    <span role="columnheader" className="text-right">
                      L
                    </span>
                    <span role="columnheader" className="text-right">
                      B
                    </span>
                    <span role="columnheader" className="text-right">
                      T
                    </span>
                  </div>
                  {/* Ett kort per material, som korten i Kapschema. Markeringen går ut i kanten; kortet rundar den. */}
                  <div role="rowgroup" className={listCard}>
                    {g.rows.map((row) => (
                      <Row key={row.key} row={row} />
                    ))}
                  </div>
                </div>
              </div>
            ))}

          {/* Siffrorna för hela listan står längst ner, bleka: bra att veta, men inget man planerar efter. */}
          {view === 'list' && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-xs text-faint tabular-nums">
                {cutList.totalCount} {cutList.totalCount === 1 ? 'del' : 'delar'} · {cutList.rows.length} olika mått ·{' '}
                {volume.format(cutList.totalVolumeM3)} m³. Mått i mm: L längs fibern, T tjocklek.
              </p>
              {/* För Excel och Numbers: att räkna pris, eller skicka listan till den som sågar. */}
              <button className={`${ghostButton} -ml-2 text-muted`} onClick={() => void saveCsv(cutList.rows)}>
                <FileSpreadsheet size={16} strokeWidth={1.75} aria-hidden />
                Spara som CSV
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** Kaplistan som CSV-fil med modellens namn: delas på pekskärm, laddas ner annars. */
async function saveCsv(rows: readonly CutListRow[]) {
  const name = safeFileName(useLibraryStore.getState().currentName) || 'Modell'
  const file = new File([cutListCsv(rows, materialTitle)], `${name} – kaplista.csv`, { type: 'text/csv' })
  await deliverFile(file)
}

function Row({ row }: { row: CutListRow }) {
  const selection = useDocumentStore((s) => s.selection)
  const select = useDocumentStore((s) => s.select)
  const isSelected = selection?.kind === 'body' && row.bodyIds.includes(selection.id)

  return (
    <div
      role="row"
      aria-selected={isSelected}
      className={`${cols} ${selectableListRow} cursor-pointer px-1.5 py-2 hover:bg-button aria-selected:bg-accent-soft narrow:py-3`}
      onClick={() => {
        const id = row.bodyIds[0]
        if (id) select({ kind: 'body', id })
      }}
    >
      <span role="cell" className="text-right font-semibold tabular-nums">
        {row.count}
      </span>
      <span role="cell">
        {compactNames(row.names)}
        {/* L×B×T är ämnet; en rund del får sin diameter under namnet. */}
        {row.round && (
          <span className="block text-xs text-muted tabular-nums">Rund, Ø {num.format(row.round.diameter)}</span>
        )}
        {/* Kulören får gå ut under måtten, där raden är tom, i stället för att brytas i den smala kolumnen. */}
        {row.paint && (
          <span className="relative block h-4">
            <span className="absolute inset-y-0 left-0 flex items-center gap-1.5 text-xs whitespace-nowrap text-muted">
              <span
                className="size-2.5 shrink-0 rounded-full ring-1 ring-black/15 ring-inset"
                style={{ background: row.paint.color }}
                aria-hidden
              />
              {firstUpper(paintText(row.paint))}
            </span>
          </span>
        )}
      </span>
      <span role="cell" className={dim}>
        {num.format(row.length)}
      </span>
      <span role="cell" className={dim}>
        {num.format(row.width)}
      </span>
      <span role="cell" className={dim}>
        {num.format(row.thickness)}
      </span>
    </div>
  )
}
