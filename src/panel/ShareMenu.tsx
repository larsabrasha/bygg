import { FileBox, FileHeart, Printer, Share } from 'lucide-react'
import { Fragment, useCallback, useRef, useState } from 'react'
import { useBodies, useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { buildExportFile, EXPORT_FORMATS, type ExportFormat } from './exportActions'
import { deliverFile } from './fileOut'
import { MenuItem } from './MenuItem'
import { useDismiss } from './useDismiss'
import { Tip } from './Tip'
import { groupTitle } from './ui'

/**
 * Skicka modellen som fil: filformaten direkt, med en rad om var varje format går att öppna.
 * AR ligger bland lägena i 3D-vyn (ViewButtons), bredvid VR.
 */
export function ShareMenu({ buttonClass }: { buttonClass: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    setError(null)
  }, [])
  useDismiss(ref, open, close)
  const bodies = useBodies()
  const empty = bodies.length === 0

  const run = async (format: ExportFormat) => {
    setBusy(format)
    setError(null)
    try {
      const { doc } = useDocumentStore.getState()
      const { currentName } = useLibraryStore.getState()
      const file = await buildExportFile(format, currentName, doc, bodies)
      close()
      await deliverFile(file)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

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
        <div className="absolute top-full right-0 z-50 mt-1 w-72 rounded-lg border border-line bg-panel py-1 shadow-lg">
          {EXPORT_FORMATS.map(({ format, label, hint }, i) => (
            <Fragment key={format}>
              {/* Bygg-filen står först och för sig: den tar med allt. */}
              {i === 1 && <p className={`${groupTitle} mt-1 border-t border-line px-3 pt-2.5 pb-1`}>Andra program</p>}
              <MenuItem
                Icon={format === 'bygg' ? FileHeart : format === 'stl' || format === '3mf' ? Printer : FileBox}
                accent={format === 'bygg'}
                disabled={busy !== null || (empty && format !== 'bygg')}
                hint={busy === format ? 'Gör filen …' : hint}
                onClick={() => void run(format)}
              >
                {label}
              </MenuItem>
            </Fragment>
          ))}
          {error && <p className="px-3 py-1 text-xs text-danger">Kunde inte exportera: {error}</p>}
        </div>
      )}
    </div>
  )
}
