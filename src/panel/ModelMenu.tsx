import { useEffect, useRef, useState } from 'react'
import { useLibraryStore, type SyncStatus } from '../store/libraryStore'
import { createModel, deleteModel, openModel, renameModel, syncNow } from '../sync/session'
import { field, secondaryButton } from './ui'
import { useDraft } from './useDraft'

const STATUS: Record<SyncStatus, { label: string; dot: string }> = {
  starting: { label: 'Startar…', dot: 'bg-faint' },
  syncing: { label: 'Synkar…', dot: 'bg-accent animate-pulse' },
  synced: { label: 'Synkad', dot: 'bg-emerald-600' },
  offline: { label: 'Offline – sparas på enheten', dot: 'bg-amber-500' },
  'local-only': { label: 'Bara på den här enheten (ingen server)', dot: 'bg-faint' },
  error: { label: 'Synkfel', dot: 'bg-danger' },
}

const when = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' })

function NameField() {
  const currentId = useLibraryStore((s) => s.currentId)
  const currentName = useLibraryStore((s) => s.currentName)
  const [name, setName] = useDraft(currentName)
  return (
    <input
      className={field}
      aria-label="Modellens namn"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => {
        if (currentId && name.trim() && name !== currentName) void renameModel(currentId, name)
        else setName(currentName)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

/** Tvåstegs-knapp: första trycket frågar, andra tar bort. Ingen webbläsardialog. */
function DeleteButton({ onDelete, label }: { onDelete: () => void; label: string }) {
  const [armed, setArmed] = useState(false)
  return armed ? (
    <button
      className="cursor-pointer rounded px-2 py-1 text-xs font-semibold text-danger narrow:min-h-11"
      onClick={onDelete}
      onBlur={() => setArmed(false)}
      autoFocus
    >
      Ta bort?
    </button>
  ) : (
    <button
      className="cursor-pointer rounded px-2 py-1 text-muted narrow:min-h-11"
      aria-label={`Ta bort ${label}`}
      title="Ta bort"
      onClick={() => setArmed(true)}
    >
      ✕
    </button>
  )
}

export function ModelMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { models, currentId, currentName, status, error } = useLibraryStore()
  const s = STATUS[status]

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
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
        onClick={() => setOpen((o) => !o)}
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
          className="absolute top-full left-0 z-50 mt-1 flex w-80 flex-col gap-3 rounded-lg border border-line bg-panel p-3 shadow-lg
            narrow:fixed narrow:inset-x-2 narrow:top-auto narrow:w-auto"
        >
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className={`size-2 rounded-full ${s.dot}`} aria-hidden />
            <span className="flex-1">
              {s.label}
              {error && status === 'error' ? `: ${error}` : ''}
            </span>
            {status !== 'syncing' && status !== 'local-only' && (
              <button className="cursor-pointer text-accent underline" onClick={() => void syncNow()}>
                Synka nu
              </button>
            )}
          </div>

          <label className="flex flex-col gap-0.5 text-xs text-muted">
            Namn på öppen modell
            <NameField />
          </label>

          <ul className="flex max-h-72 flex-col overflow-y-auto">
            {models.map((m) => (
              <li key={m.id} className="flex items-center gap-1 border-b border-line last:border-b-0">
                <button
                  className={`flex min-w-0 flex-1 cursor-pointer flex-col items-start rounded px-1.5 py-1.5 text-left narrow:min-h-11 ${
                    m.id === currentId ? 'bg-accent-soft' : 'hover:bg-hover'
                  }`}
                  aria-current={m.id === currentId}
                  onClick={() => {
                    void openModel(m.id)
                    setOpen(false)
                  }}
                >
                  <span className="w-full truncate">{m.name}</span>
                  <span className="text-xs text-faint">
                    {when.format(new Date(m.updatedAt))}
                    {m.dirty && status !== 'local-only' ? ' · ej synkad' : ''}
                  </span>
                </button>
                <DeleteButton label={m.name} onDelete={() => void deleteModel(m.id)} />
              </li>
            ))}
          </ul>

          <button
            className={secondaryButton}
            onClick={() => {
              void createModel()
              setOpen(false)
            }}
          >
            + Ny modell
          </button>
        </div>
      )}
    </div>
  )
}
