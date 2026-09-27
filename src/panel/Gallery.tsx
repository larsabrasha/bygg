import { Box, Copy, Ellipsis, FolderOpen, LoaderCircle, LogIn, LogOut, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLibraryStore, type ModelListItem } from '../store/libraryStore'
import { nameFromFileName, readModelFile } from '../persist/modelFile'
import { currentUser, loginUrl } from '../sync/auth'
import { get as localGet, set as localSet } from '../sync/localStore'
import {
  deleteWithUndo,
  duplicateModel,
  importModel,
  logout,
  openFromGallery,
  renameModel,
  saveNow,
} from '../sync/session'
import { MenuItem } from './MenuItem'
import { splitConflict } from './modelName'
import { Notices } from './Notices'
import { Logo } from './Logo'
import { SyncBadge } from './SyncBadge'
import { field, ghostButton, primaryButton, secondaryButton } from './ui'
import { useDismiss } from './useDismiss'
import { shortWhen } from './when'
import { Tip } from './Tip'

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
  // Den här öppnas: bilden dimmas och "Öppnar …" visas direkt, så att trycket syns.
  const opening = useLibraryStore((s) => s.opening?.id === model.id)
  const conflict = splitConflict(model.name)
  const title = conflict?.base ?? model.name

  return (
    <li className="min-w-0">
      <button
        className="block w-full cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-accent"
        aria-label={`Öppna ${model.name}`}
        aria-busy={opening}
        onClick={() => void openFromGallery(model.id)}
      >
        {/* Den modell man kom ifrån, och den som öppnas, får en ram. */}
        <div
          className={`relative grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border bg-panel ${
            isCurrent || opening ? 'border-accent ring-2 ring-accent-soft' : 'border-line'
          }`}
        >
          {thumb ? (
            <img
              src={thumb}
              alt=""
              draggable={false}
              className={`size-full object-contain select-none [-webkit-touch-callout:none] ${
                opening ? 'opacity-30' : ''
              }`}
            />
          ) : (
            <Box size={40} strokeWidth={1.25} className="text-faint" aria-hidden />
          )}
          {opening && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-[13px]" role="status">
              {/* En CSS-animation: den snurrar också medan sidan räknar fram delarna. */}
              <LoaderCircle size={20} strokeWidth={2} className="animate-spin text-accent" aria-hidden />
              Öppnar …
            </div>
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
            {model.example && <span className="rounded bg-accent-soft px-1 font-medium text-accent">Exempel</span>}
            {conflict && (
              <Tip label={`Krock ${conflict.when}`}>
                <span className="rounded bg-warn-soft px-1 font-medium text-warn">Konflikt</span>
              </Tip>
            )}
            <span className="truncate">
              {shortWhen(model.updatedAt)}
              {model.dirty && status !== 'local-only' && status !== 'guest' ? ' · ej synkad' : ''}
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

/** Läser en modellfil (från Dela → Bygg-fil), lägger till den och öppnar den. */
async function importFile(file: File) {
  const r = readModelFile(await file.text(), nameFromFileName(file.name))
  if (!r.ok) {
    useLibraryStore.getState().notify(`${file.name} gick inte att öppna: ${r.reason}.`)
    return
  }
  await openFromGallery(await importModel(r.name, r.doc))
}

/** I gästens databas när rutan om provläget stängts. */
const INTRO_KEY = 'bygg:guest-intro-closed'

/**
 * Överst i startvyn utan konto: att modellerna är exempel och inte någon annans,
 * och att allt bara sparas i webbläsaren. Går att stänga.
 */
function GuestIntro() {
  const guest = useLibraryStore((s) => s.status === 'guest')
  const [closed, setClosed] = useState(true)
  useEffect(() => {
    if (!guest) return
    void localGet<boolean>(INTRO_KEY).then(
      (c) => setClosed(c === true),
      () => setClosed(false),
    )
  }, [guest])
  if (!guest || closed) return null
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl bg-panel p-4 shadow-[0_6px_20px_-12px_rgba(40,25,10,0.35)] ring-1 ring-line narrow:flex-wrap">
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-medium">Du provar Bygg utan konto</p>
        <p className="mt-1 max-w-[620px] text-[13px] leading-relaxed text-muted">
          Modellerna märkta <span className="rounded bg-accent-soft px-1 font-medium text-accent">Exempel</span> finns
          här för att prova på: öppna, ändra eller ta bort dem, eller börja på en ny. Allt sparas bara i den här
          webbläsaren och syns inte på dina andra enheter.
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button className={primaryButton} onClick={() => void saveNow().finally(() => location.assign(loginUrl()))}>
          <LogIn size={16} aria-hidden />
          Logga in
        </button>
        <button
          className="grid size-10 cursor-pointer place-items-center rounded-lg text-muted hover:bg-hover narrow:size-11"
          aria-label="Stäng"
          onClick={() => {
            setClosed(true)
            void localSet(INTRO_KEY, true)
          }}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
    </div>
  )
}

/** Loggar ut; visar vem som är inloggad. Inte i dev, där det inte finns någon inloggning. */
function LogoutButton() {
  const user = currentUser()
  if (!user || user.dev) return null
  return (
    <Tip label={`Inloggad som ${user.name}. Logga ut.`}>
      <button className={ghostButton} aria-label={`Logga ut ${user.name}`} onClick={() => void logout()}>
        <LogOut size={18} aria-hidden />
      </button>
    </Tip>
  )
}

/** Knapp som öppnar en modellfil. På smal skärm bara ikonen. */
function ImportButton() {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Tip label="Öppna en modellfil">
        <button className={secondaryButton} aria-label="Importera" onClick={() => input.current?.click()}>
          <FolderOpen size={18} aria-hidden />
          <span className="narrow:hidden">Importera</span>
        </button>
      </Tip>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          // Tomt, så att samma fil går att välja igen.
          e.currentTarget.value = ''
          if (file) void importFile(file)
        }}
      />
    </>
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
        <h1 className="flex items-center">
          <Logo height={30} />
        </h1>
        <div className="min-w-0 flex-1">
          <SyncBadge />
        </div>
        <LogoutButton />
        <ImportButton />
        <button className={primaryButton} onClick={() => void openFromGallery('new')}>
          <Plus size={18} aria-hidden />
          Ny modell
        </button>
      </header>
      <main className="relative min-h-0 flex-1 overflow-y-auto p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <Notices />
        <GuestIntro />
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-4 gap-y-5 narrow:grid-cols-2 narrow:gap-x-3">
          {visible.map((m) => (
            <ModelTile key={m.id} model={m} thumb={thumbs[m.id]} isCurrent={m.id === currentId} />
          ))}
        </ul>
      </main>
    </div>
  )
}
