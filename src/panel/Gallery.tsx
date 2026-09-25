import { Box, Copy, Ellipsis, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useLibraryStore, type ModelListItem } from '../store/libraryStore'
import { deleteWithUndo, duplicateModel, openFromGallery, renameModel } from '../sync/session'
import { MenuItem } from './MenuItem'
import { splitConflict } from './modelName'
import { Notices } from './Notices'
import { SyncBadge } from './SyncBadge'
import { field, primaryButton } from './ui'
import { useDismiss } from './useDismiss'
import { shortWhen } from './when'

function RenameField({ model, onDone }: { model: ModelListItem; onDone: () => void }) {
  const [name, setName] = useState(model.name)
  const save = () => {
    if (name.trim() && name !== model.name) void renameModel(model.id, name)
    onDone()
  }
  return (
    <input
      className={`${field} font-medium`}
      aria-label="Modellens namn"
      value={name}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setName(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setName(model.name)
          onDone()
        }
      }}
    />
  )
}

function ModelTile({ model, thumb, isCurrent }: { model: ModelListItem; thumb?: string; isCurrent: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  useDismiss(menuRef, menuOpen, closeMenu)
  const status = useLibraryStore((s) => s.status)
  const conflict = splitConflict(model.name)
  const title = conflict?.base ?? model.name

  return (
    <li className="min-w-0">
      <button
        className="block w-full cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-accent"
        aria-label={`Öppna ${model.name}`}
        onClick={() => void openFromGallery(model.id)}
      >
        {/* Den modell man kom ifrån får en ram. */}
        <div
          className={`grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border bg-panel ${
            isCurrent ? 'border-accent ring-2 ring-accent-soft' : 'border-line'
          }`}
        >
          {thumb ? (
            <img
              src={thumb}
              alt=""
              draggable={false}
              className="size-full object-contain select-none [-webkit-touch-callout:none]"
            />
          ) : (
            <Box size={40} strokeWidth={1.25} className="text-faint" aria-hidden />
          )}
        </div>
      </button>
      <div className="mt-1.5 flex items-start gap-1">
        <div className="min-w-0 flex-1 pl-0.5">
          {renaming ? (
            <RenameField model={model} onDone={() => setRenaming(false)} />
          ) : (
            <p className="truncate font-medium" title={model.name}>
              {title}
            </p>
          )}
          <p className="flex items-center gap-1.5 text-xs text-faint tabular-nums">
            {conflict && (
              <span className="rounded bg-warn-soft px-1 font-medium text-warn" title={`Krock ${conflict.when}`}>
                Konflikt
              </span>
            )}
            <span className="truncate">
              {shortWhen(model.updatedAt)}
              {model.dirty && status !== 'local-only' ? ' · ej synkad' : ''}
            </span>
          </p>
        </div>
        <div ref={menuRef} className="relative">
          <button
            className="grid size-8 cursor-pointer place-items-center rounded-md text-muted hover:bg-hover narrow:size-11"
            aria-label={`Mer för ${model.name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Ellipsis size={18} aria-hidden />
          </button>
          {menuOpen && (
            <div className="absolute top-full right-0 z-10 mt-1 w-48 rounded-lg border border-line bg-panel py-1 shadow-lg">
              <MenuItem
                Icon={Pencil}
                onClick={() => {
                  setMenuOpen(false)
                  setRenaming(true)
                }}
              >
                Byt namn
              </MenuItem>
              <MenuItem
                Icon={Copy}
                onClick={() => {
                  setMenuOpen(false)
                  void duplicateModel(model.id)
                }}
              >
                Duplicera
              </MenuItem>
              <MenuItem
                Icon={Trash2}
                danger
                onClick={() => {
                  setMenuOpen(false)
                  deleteWithUndo(model.id)
                }}
              >
                Ta bort
              </MenuItem>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * Startvyn: alla modeller som bilder, senast ändrade först, som i Shapr3D
 * eller Pages. Ligger ovanpå 3D-vyn, som hålls kvar i bakgrunden så att det
 * går fort att öppna en modell igen.
 */
export function Gallery() {
  const models = useLibraryStore((s) => s.models)
  const thumbs = useLibraryStore((s) => s.thumbs)
  const currentId = useLibraryStore((s) => s.currentId)
  const pending = useLibraryStore((s) => s.pendingDelete)
  const visible = models.filter((m) => !pending.includes(m.id))

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-canvas print:hidden">
      <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2 pt-[max(8px,env(safe-area-inset-top))]">
        <h1 className="text-lg font-semibold">Modeller</h1>
        <div className="min-w-0 flex-1">
          <SyncBadge />
        </div>
        <button className={primaryButton} onClick={() => void openFromGallery('new')}>
          <Plus size={18} aria-hidden />
          Ny modell
        </button>
      </header>
      <main className="relative min-h-0 flex-1 overflow-y-auto p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <Notices />
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-4 gap-y-5 narrow:grid-cols-2 narrow:gap-x-3">
          {visible.map((m) => (
            <ModelTile key={m.id} model={m} thumb={thumbs[m.id]} isCurrent={m.id === currentId} />
          ))}
        </ul>
      </main>
    </div>
  )
}
