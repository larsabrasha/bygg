import { cutListCsv, cutListFileName } from '../model/cutlistExport'
import type { CutList } from '../model/cutlist'

export function downloadCutListCsv(cutList: CutList, modelName: string) {
  const url = URL.createObjectURL(new Blob([cutListCsv(cutList)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = cutListFileName(modelName, 'csv')
  a.click()
  // Safari behöver adressen en stund efter klicket.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Utskriften (src/panel/PrintCutList.tsx) tar sitt PDF-filnamn från dokumentets titel. */
export function printCutList(modelName: string) {
  const previous = document.title
  document.title = cutListFileName(modelName, 'pdf').replace(/\.pdf$/, '')
  window.addEventListener('afterprint', () => (document.title = previous), { once: true })
  window.print()
}
