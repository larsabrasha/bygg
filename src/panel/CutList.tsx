import { Download, Printer } from 'lucide-react'
import { useMemo } from 'react'
import { buildCutList } from '../model/cutlist'
import { useBodies, useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { downloadCutListCsv, printCutList } from './cutlistActions'
import { EmptyState } from './EmptyState'
import { CutListPicture } from './pictures'
import { secondaryButton, sectionTitle } from './ui'
import { numberFormat } from '../model/numberFormat'

const num = numberFormat(1, true)
const volume = numberFormat(4, true)

export function CutList() {
  const bodies = useBodies()
  const selection = useDocumentStore((s) => s.selection)
  const select = useDocumentStore((s) => s.select)
  const cutList = useMemo(() => buildCutList(bodies), [bodies])
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
        <>
          <table className="w-full border-collapse text-[13px] [&_td]:border-b [&_td]:border-line [&_td]:px-1.5 [&_td]:py-1 [&_th]:border-b [&_th]:border-line [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-left narrow:[&_td]:py-3 narrow:[&_th]:py-3">
            <thead>
              <tr>
                <th className="text-right! whitespace-nowrap">Antal</th>
                <th>Namn</th>
                <th className="text-right! whitespace-nowrap">L × B × T</th>
                <th>Material</th>
              </tr>
            </thead>
            <tbody>
              {cutList.rows.map((row) => {
                const isSelected = selection?.kind === 'body' && row.bodyIds.includes(selection.id)
                return (
                  <tr
                    key={row.key}
                    className={`cursor-pointer ${isSelected ? 'bg-accent-soft' : 'hover:bg-hover'}`}
                    onClick={() => {
                      const id = row.bodyIds[0]
                      if (id) select({ kind: 'body', id })
                    }}
                  >
                    <td className="text-right whitespace-nowrap tabular-nums">{row.count}</td>
                    <td>{row.names.join(', ')}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {row.round
                        ? `Ø ${num.format(row.round.diameter)} × ${num.format(row.round.length)}`
                        : `${num.format(row.length)} × ${num.format(row.width)} × ${num.format(row.thickness)}`}
                    </td>
                    <td>{row.material}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="text-muted [&_td]:border-b-0">
              <tr>
                <td className="text-right whitespace-nowrap tabular-nums">{cutList.totalCount}</td>
                <td colSpan={3}>st, totalt {volume.format(cutList.totalVolumeM3)} m³</td>
              </tr>
            </tfoot>
          </table>
          <div className="mt-3 flex gap-2">
            <button className={secondaryButton} onClick={() => printCutList(modelName)}>
              <Printer size={16} strokeWidth={1.75} aria-hidden />
              Skriv ut / PDF
            </button>
            <button className={secondaryButton} onClick={() => downloadCutListCsv(cutList, modelName)}>
              <Download size={16} strokeWidth={1.75} aria-hidden />
              Ladda ner CSV
            </button>
          </div>
        </>
      )}
    </section>
  )
}
