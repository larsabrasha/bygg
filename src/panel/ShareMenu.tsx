import { DraftingCompass, FileDown, Share } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { buildCutList } from '../model/cutlist'
import { useBodies } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { useViewStore } from '../store/viewStore'
import { ArButton } from './ArButton'
import { downloadCutListCsv } from './cutlistActions'
import { MenuItem } from './MenuItem'
import { useDismiss } from './useDismiss'
import { Tip } from './Tip'

/** Sätt att visa eller ta ut modellen: AR, ritningen (där kaplistan skrivs ut) och kaplistan som CSV. */
export function ShareMenu({ buttonClass }: { buttonClass: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  const bodies = useBodies()
  const cutList = useMemo(() => buildCutList(bodies), [bodies])
  const modelName = useLibraryStore((s) => s.currentName)
  const empty = cutList.rows.length === 0

  return (
    <div ref={ref} className="relative">
      <Tip label="Dela">
        <button className={buttonClass} aria-label="Dela" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Share size={20} strokeWidth={1.75} aria-hidden />
        </button>
      </Tip>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-64 rounded-lg border border-line bg-panel py-1 shadow-lg">
          <ArButton onOpened={close} />
          <MenuItem
            Icon={DraftingCompass}
            disabled={empty}
            onClick={() => {
              close()
              useViewStore.getState().setDrawing(true)
            }}
          >
            Ritning och kaplista (skriv ut / PDF)
          </MenuItem>
          <MenuItem
            Icon={FileDown}
            disabled={empty}
            onClick={() => {
              close()
              downloadCutListCsv(cutList, modelName)
            }}
          >
            Ladda ner kaplista (CSV)
          </MenuItem>
        </div>
      )}
    </div>
  )
}
