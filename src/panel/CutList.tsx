import { DraftingCompass, Download, Printer } from 'lucide-react'
import { useMemo } from 'react'
import { buildCutList, groupByMaterial, type CutListRow } from '../model/cutlist'
import { compactNames } from '../model/cutlistExport'
import { numberFormat } from '../model/numberFormat'
import { materialColor } from '../scene/colors'
import { useBodies, useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { useViewStore } from '../store/viewStore'
import { downloadCutListCsv, printCutList } from './cutlistActions'
import { EmptyState } from './EmptyState'
import { CutListPicture } from './pictures'
import { groupTitle, primaryButton, secondaryButton, sectionTitle } from './ui'

const num = numberFormat(1, true)
const volume = numberFormat(4, true)

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('sv') + s.slice(1)

// Kolumnerna för L, B och T har fast bredd, så att måtten står i linje mellan materialen.
const dimCol = 'w-12 text-right tabular-nums'

export function CutList() {
  const bodies = useBodies()
  const cutList = useMemo(() => buildCutList(bodies), [bodies])
  const groups = useMemo(() => groupByMaterial(cutList.rows), [cutList])
  const modelName = useLibraryStore((s) => s.currentName)

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
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Delar" value={String(cutList.totalCount)} />
            <Stat label="Olika mått" value={String(cutList.rows.length)} />
            <Stat label="Volym" value={volume.format(cutList.totalVolumeM3)} unit="m³" />
          </dl>

          {groups.map((g) => (
            <div key={g.material} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 px-1.5">
                <span
                  className="size-3 shrink-0 rounded-[3px] ring-1 ring-black/15 ring-inset"
                  style={{ background: materialColor(g.material) }}
                  aria-hidden
                />
                <h3 className="text-[13px] font-semibold">{capitalize(g.material)}</h3>
                <span className="ml-auto text-xs text-muted tabular-nums">
                  {g.count} st · {volume.format(g.volumeM3)} m³
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

          <div className="flex flex-col gap-3">
            <p className="text-xs text-faint">Mått i mm. L längs fibern, T tjocklek.</p>
            <div className="flex flex-wrap gap-2">
              <button className={primaryButton} onClick={() => useViewStore.getState().setDrawing(true)}>
                <DraftingCompass size={16} strokeWidth={1.75} aria-hidden />
                Ritning
              </button>
              <button className={secondaryButton} onClick={() => printCutList(modelName)}>
                <Printer size={16} strokeWidth={1.75} aria-hidden />
                Skriv ut / PDF
              </button>
              <button className={secondaryButton} onClick={() => downloadCutListCsv(cutList, modelName)}>
                <Download size={16} strokeWidth={1.75} aria-hidden />
                Ladda ner CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-hover px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate text-[17px] font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted">{unit}</span>}
      </dd>
    </div>
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
