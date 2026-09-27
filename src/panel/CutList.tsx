import { useMemo, useState } from 'react'
import { buildCutList, groupByMaterial, type CutListRow } from '../model/cutlist'
import { compactNames } from '../model/cutlistExport'
import { numberFormat } from '../model/numberFormat'
import { materialColor } from '../scene/colors'
import { useBodies, useDocumentStore } from '../store/documentStore'
import { EmptyState } from './EmptyState'
import { CutPlanView } from './CutPlanView'
import { CutListPicture } from './pictures'
import { groupTitle, sectionTitle } from './ui'
import { isOrdered, materialTitle } from '../model/materials'

const num = numberFormat(1, true)
const volume = numberFormat(4, true)

// Kolumnerna för L, B och T har fast bredd, så att måtten står i linje mellan materialen.
const dimCol = 'w-12 text-right tabular-nums'

/** En knapp i en rad där en är vald (Lista, Kapschema). */
const segment =
  'h-9 flex-1 cursor-pointer rounded-md text-[13px] font-medium text-muted aria-pressed:bg-accent-soft aria-pressed:text-accent narrow:h-10'

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
          <div className="flex rounded-lg bg-button p-0.5" role="group" aria-label="Visa">
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
                <div className="flex items-center gap-2 px-1.5">
                  <span
                    className="size-3 shrink-0 rounded-[3px] ring-1 ring-black/15 ring-inset"
                    style={{ background: materialColor(g.material) }}
                    aria-hidden
                  />
                  <h3 className="text-[13px] font-semibold">{materialTitle(g.material)}</h3>
                  <span className="ml-auto text-xs text-muted tabular-nums">
                    {/* Glas köps per ruta, inte per kubikmeter. */}
                    {g.count} st · {isOrdered(g.material) ? 'beställs tillskuret' : `${volume.format(g.volumeM3)} m³`}
                  </span>
                </div>
                <table className="w-full border-collapse text-[13px]">
                  <thead className={groupTitle}>
                    <tr className="border-b border-line [&_th]:px-1.5 [&_th]:py-1.5 [&_th]:font-semibold">
                      <th className="w-8 text-right">St</th>
                      <th className="text-left">Del</th>
                      <th className={dimCol}>L</th>
                      <th className={dimCol}>B</th>
                      <th className={`${dimCol} w-10`}>T</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((row) => (
                      <Row key={row.key} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {/* Siffrorna för hela listan står längst ner, bleka: bra att veta, men inget man planerar efter. */}
          {view === 'list' && (
            <p className="text-xs text-faint tabular-nums">
              {cutList.totalCount} {cutList.totalCount === 1 ? 'del' : 'delar'} · {cutList.rows.length} olika mått ·{' '}
              {volume.format(cutList.totalVolumeM3)} m³. Mått i mm: L längs fibern, T tjocklek.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function Row({ row }: { row: CutListRow }) {
  const selection = useDocumentStore((s) => s.selection)
  const select = useDocumentStore((s) => s.select)
  const isSelected = selection?.kind === 'body' && row.bodyIds.includes(selection.id)

  return (
    <tr
      className={`cursor-pointer border-b border-line align-baseline [&_td]:px-1.5 [&_td]:py-2 narrow:[&_td]:py-3 ${
        isSelected ? 'bg-accent-soft' : 'hover:bg-hover'
      }`}
      onClick={() => {
        const id = row.bodyIds[0]
        if (id) select({ kind: 'body', id })
      }}
    >
      <td className="text-right font-semibold tabular-nums">{row.count}</td>
      <td>
        {compactNames(row.names)}
        {/* L×B×T är ämnet; en rund del får sin diameter under namnet. */}
        {row.round && (
          <span className="block text-xs text-muted tabular-nums">Rund, Ø {num.format(row.round.diameter)}</span>
        )}
      </td>
      <td className={dimCol}>{num.format(row.length)}</td>
      <td className={dimCol}>{num.format(row.width)}</td>
      <td className={dimCol}>{num.format(row.thickness)}</td>
    </tr>
  )
}
