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
