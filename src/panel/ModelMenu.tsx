import { Check, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLibraryStore, type SyncStatus } from '../store/libraryStore'
import { createModel, deleteModel, openModel, renameModel, syncNow } from '../sync/session'
import { ArButton } from './ArButton'
import { MenuItem } from './MenuItem'
import { dangerButton, field, secondaryButton } from './ui'
import { shortWhen } from './when'

const STATUS: Record<SyncStatus, { label: string; dot: string }> = {
  starting: { label: 'Startar…', dot: 'bg-faint' },
  syncing: { label: 'Synkar…', dot: 'bg-accent animate-pulse' },
  synced: { label: 'Synkad', dot: 'bg-emerald-600' },
  offline: { label: 'Offline – sparas på enheten', dot: 'bg-amber-500' },
  'local-only': { label: 'Bara på den här enheten', dot: 'bg-faint' },
  error: { label: 'Synkfel', dot: 'bg-danger' },
}

/** Namnet på öppen modell; blir ett textfält när man byter namn. */
function Title({ renaming, onDone }: { renaming: boolean; onDone: () => void }) {
  const currentId = useLibraryStore((s) => s.currentId)
  const currentName = useLibraryStore((s) => s.currentName)
  const [name, setName] = useState(currentName)

  if (!renaming) return <p className="truncate text-base font-semibold">{currentName || 'Modell'}</p>
  const save = () => {
    if (currentId && name.trim() && name !== currentName) void renameModel(currentId, name)
    onDone()
  }
  return (
    <input
      className={`${field} text-base font-semibold`}
      aria-label="Modellens namn"
      value={name}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setName(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.stopPropagation()
          setName(currentName)
          onDone()
        }
      }}
    />
  )
}

/** Frågar innan modellen tas bort, direkt i menyn (ingen webbläsardialog). */
function ConfirmDelete({ onCancel, onDeleted }: { onCancel: () => void; onDeleted: () => void }) {
  const currentId = useLibraryStore((s) => s.currentId)
  const currentName = useLibraryStore((s) => s.currentName)
  const uploaded = useLibraryStore((s) => s.currentBase !== null)
  return (
    <div className="flex flex-col gap-2 rounded-md border border-danger/40 p-3">
      <p>Ta bort ”{currentName}”?</p>
      <p className="text-xs text-muted">
        {uploaded
          ? 'Den tas bort från alla enheter. En kopia sparas i serverns papperskorg.'
          : 'Den finns bara på den här enheten och går inte att få tillbaka.'}
      </p>
      <div className="flex gap-2">
        <button
          className={dangerButton}
          onClick={() => {
            if (currentId) void deleteModel(currentId)
            onDeleted()
          }}
        >
          Ta bort
        </button>
        <button className={secondaryButton} onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </div>
  )
}

/**
 * Modellmenyn, som Arkiv-menyn i en vanlig app: överst den öppna modellen
 * och vad man kan göra med den, under det alla modeller och Ny modell.
 */
export function ModelMenu() {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { models, currentId, currentName, status, error } = useLibraryStore()
  const s = STATUS[status]
  const current = models.find((m) => m.id === currentId)

  const close = () => {
    setOpen(false)
    setRenaming(false)
    setConfirming(false)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        className="flex min-h-9 max-w-full cursor-pointer items-center gap-2 rounded-md px-2 font-semibold hover:bg-hover narrow:min-h-11"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${currentName || 'Modell'}, ${s.label}`}
        title={s.label}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className={`size-2 shrink-0 rounded-full ${s.dot}`} aria-hidden />
        <span className="truncate">{currentName || 'Modell'}</span>
        <span className="text-muted" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Modeller"
          className="absolute top-full left-0 z-50 mt-1 flex max-h-[calc(100dvh-80px)] w-80 flex-col overflow-y-auto rounded-lg border border-line bg-panel py-2 shadow-lg
            narrow:fixed narrow:inset-x-2 narrow:top-auto narrow:w-auto"
        >
          {/* Öppen modell: namn och synkstatus. */}
          <div className="flex flex-col gap-1 px-3 pb-2">
            <Title key={String(renaming)} renaming={renaming} onDone={() => setRenaming(false)} />
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className={`size-2 shrink-0 rounded-full ${s.dot}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {s.label}
                {error && status === 'error' ? `: ${error}` : ''}
                {current ? ` · ändrad ${shortWhen(current.updatedAt)}` : ''}
              </span>
              {status !== 'syncing' && status !== 'local-only' && (
                <button
                  className="-my-1 grid size-7 cursor-pointer place-items-center rounded hover:bg-hover narrow:size-9"
                  aria-label="Synka nu"
                  title="Synka nu"
                  onClick={() => void syncNow()}
                >
                  <RefreshCw size={14} aria-hidden />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col px-1">
            {confirming ? (
              <div className="px-2">
                <ConfirmDelete onCancel={() => setConfirming(false)} onDeleted={close} />
              </div>
            ) : (
              <>
                <MenuItem Icon={Pencil} onClick={() => setRenaming(true)}>
                  Byt namn
                </MenuItem>
                <ArButton onOpened={close} />
                <MenuItem Icon={Trash2} danger onClick={() => setConfirming(true)}>
                  Ta bort modell…
                </MenuItem>
              </>
            )}
          </div>

          <hr className="my-2 border-line" />

          <p className="px-4 pb-1 text-xs tracking-wide text-muted uppercase">Modeller</p>
          <div className="flex flex-col px-1">
            <MenuItem
              Icon={Plus}
              onClick={() => {
                void createModel()
                close()
              }}
            >
              Ny modell
            </MenuItem>
            <ul className="flex flex-col">
              {models.map((m) => (
                <li key={m.id}>
                  <button
                    className="flex min-h-9 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-left hover:bg-hover narrow:min-h-11"
                    aria-current={m.id === currentId}
                    onClick={() => {
                      void openModel(m.id)
                      close()
                    }}
                  >
                    {/* Bocken visar vilken modell som är öppen; utan bock hålls platsen tom så att namnen står i linje. */}
                    <Check
                      size={18}
                      strokeWidth={2}
                      aria-hidden
                      className={`shrink-0 text-accent ${m.id === currentId ? '' : 'invisible'}`}
                    />
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="shrink-0 text-xs text-faint tabular-nums">
                      {m.dirty && status !== 'local-only' ? 'ej synkad · ' : ''}
                      {shortWhen(m.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
