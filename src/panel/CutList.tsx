import { useMemo } from 'react'
import { buildCutList } from '../model/cutlist'
import { cutListCsv, cutListFileName } from '../model/cutlistExport'
import { useBodies, useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { secondaryButton, sectionTitle } from './ui'

const num = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 })
const volume = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 4 })

function downloadCsv(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  // Safari behöver adressen en stund efter klicket.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Utskriften (src/panel/PrintCutList.tsx) tar sitt PDF-filnamn från dokumentets titel. */
function printCutList(modelName: string) {
  const previous = document.title
  document.title = cutListFileName(modelName, 'pdf').replace(/\.pdf$/, '')
  window.addEventListener('afterprint', () => (document.title = previous), { once: true })
  window.print()
}

export function CutList() {
  const bodies = useBodies()
  const selection = useDocumentStore((s) => s.selection)
  const select = useDocumentStore((s) => s.select)
  const cutList = useMemo(() => buildCutList(bodies), [bodies])
  const modelName = useLibraryStore((s) => s.currentName)

  return (
    <section className="narrow:group-data-[tab=params]/sheet:hidden narrow:group-data-[tab=properties]/sheet:hidden">
      <h2 className={sectionTitle}>Kaplista</h2>
      {cutList.rows.length === 0 ? (
        <p className="text-faint">Inga delar än. Rita en rektangel och dra i pilen.</p>
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
                      {num.format(row.length)} × {num.format(row.width)} × {num.format(row.thickness)}
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
              Skriv ut / PDF
            </button>
            <button
              className={secondaryButton}
              onClick={() => downloadCsv(cutListCsv(cutList), cutListFileName(modelName, 'csv'))}
            >
              Ladda ner CSV
            </button>
          </div>
        </>
      )}
    </section>
  )
}
