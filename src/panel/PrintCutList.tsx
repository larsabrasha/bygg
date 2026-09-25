import { useMemo } from 'react'
import { buildCutList } from '../model/cutlist'
import { formatMm } from '../model/cutlistExport'
import { useBodies } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'

const volume = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 4 })

/**
 * Kaplistan som den skrivs ut (eller sparas som PDF). Syns bara i utskrift; appen döljs då.
 * Fasta färger i stället för temavariablerna, så att utskriften blir svart på vitt även i mörkt läge.
 */
export function PrintCutList() {
  const bodies = useBodies()
  const name = useLibraryStore((s) => s.currentName)
  const cutList = useMemo(() => buildCutList(bodies), [bodies])

  return (
    <div className="hidden bg-white text-[11pt] text-black print:block">
      <h1 className="text-[16pt] font-semibold">{name || 'Kaplista'}</h1>
      <p className="mb-4 text-[10pt] text-neutral-600">
        Kaplista · {new Date().toLocaleDateString('sv-SE')} · mått i mm, L längs fibern
      </p>
      <table className="w-full border-collapse [&_td]:border-b [&_td]:border-neutral-300 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border-b-2 [&_th]:border-black [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_tr]:break-inside-avoid">
        <thead>
          <tr>
            <th className="w-8" aria-label="Kapad" />
            <th className="text-right!">Antal</th>
            <th>Namn</th>
            <th className="text-right!">L</th>
            <th className="text-right!">B</th>
            <th className="text-right!">T</th>
            <th>Material</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {cutList.rows.map((row) => (
            <tr key={row.key}>
              {/* Tom ruta att bocka av i verkstaden. */}
              <td>
                <span className="block size-4 border border-black" />
              </td>
              <td className="text-right">{row.count}</td>
              <td>{row.names.join(', ')}</td>
              <td className="text-right">{formatMm(row.length)}</td>
              <td className="text-right">{formatMm(row.width)}</td>
              <td className="text-right">{formatMm(row.thickness)}</td>
              <td>{row.material}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="border-b-0!" />
            <td className="border-b-0! text-right tabular-nums">{cutList.totalCount}</td>
            <td className="border-b-0!" colSpan={5}>
              st, totalt {volume.format(cutList.totalVolumeM3)} m³
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
