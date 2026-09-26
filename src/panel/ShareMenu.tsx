import { ChevronLeft, ChevronRight, DraftingCompass, FileBox, FileDown, Printer, Share } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { buildCutList } from '../model/cutlist'
import type { Body } from '../model/types'
import { useBodies, useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { useViewStore } from '../store/viewStore'
import { ArButton } from './ArButton'
import { VrButton } from './VrButton'
import { downloadCutListCsv } from './cutlistActions'
import { buildExportFile, EXPORT_FORMATS, type ExportFormat } from './exportActions'
import { deliverFile } from './fileOut'
import { MenuItem } from './MenuItem'
import { useDismiss } from './useDismiss'
import { Tip } from './Tip'

/**
 * Sätt att visa eller ta ut modellen: AR, ritningen (kaplistan är sista bladet), kaplistan
 * som CSV, och Exportera, som byter menyn mot listan med filformat.
 */
export function ShareMenu({ buttonClass }: { buttonClass: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<'main' | 'export'>('main')
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    setPage('main')
  }, [])
  useDismiss(ref, open, close)
  const bodies = useBodies()
  const cutList = useMemo(() => buildCutList(bodies), [bodies])
  const modelName = useLibraryStore((s) => s.currentName)
  const empty = cutList.rows.length === 0

  return (
    <div ref={ref} className="relative">
      <Tip label="Dela">
        <button
          className={buttonClass}
          aria-label="Dela"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <Share size={20} strokeWidth={1.75} aria-hidden />
        </button>
      </Tip>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-64 rounded-lg border border-line bg-panel py-1 shadow-lg">
          {page === 'main' ? (
            <>
              <ArButton onOpened={close} />
              <VrButton onOpened={close} />
              <MenuItem
                Icon={DraftingCompass}
                disabled={empty}
                onClick={() => {
                  close()
                  useViewStore.getState().setDrawing(true)
                }}
              >
                Ritning
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
              <MenuItem Icon={FileBox} onClick={() => setPage('export')}>
                <span className="flex items-center justify-between">
                  Exportera
                  <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="text-muted" />
                </span>
              </MenuItem>
            </>
          ) : (
            <ExportList bodies={bodies} empty={empty} onBack={() => setPage('main')} onDone={close} />
          )}
        </div>
      )}
    </div>
  )
}

/** Filformaten. Filen görs när man väljer ett format, och delas eller laddas ner när den är klar. */
function ExportList({
  bodies,
  empty,
  onBack,
  onDone,
}: {
  bodies: readonly Body[]
  empty: boolean
  onBack: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (format: ExportFormat) => {
    setBusy(format)
    setError(null)
    try {
      const { doc } = useDocumentStore.getState()
      const { currentName } = useLibraryStore.getState()
      const file = await buildExportFile(format, currentName, doc, bodies)
      onDone()
      await deliverFile(file)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <MenuItem Icon={ChevronLeft} onClick={onBack}>
        <span className="font-medium">Exportera</span>
      </MenuItem>
      <div className="my-1 border-t border-line" />
      {EXPORT_FORMATS.map(({ format, label, hint }) => (
        <MenuItem
          key={format}
          Icon={format === 'stl' || format === '3mf' ? Printer : FileBox}
          disabled={busy !== null || (empty && format !== 'bygg')}
          hint={busy === format ? 'Gör filen …' : hint}
          onClick={() => void run(format)}
        >
          {label}
        </MenuItem>
      ))}
      {error && <p className="px-3 py-1 text-xs text-danger">Kunde inte exportera: {error}</p>}
    </>
  )
}
