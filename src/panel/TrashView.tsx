import { ArchiveRestore, Box, ChevronLeft, Ellipsis, LoaderCircle, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { daysLeft } from '../sync/localTrash'
import { TRASH_DAYS } from '../sync/protocol'
import { deleteForever, restoreFromTrash, showTrash } from '../sync/session'
import { useLibraryStore, type TrashListItem } from '../store/libraryStore'
import { MenuItem } from './MenuItem'
import { Notices } from './Notices'
import { dangerButton, ghostButton, quietDangerButton, secondaryButton } from './ui'
import { useDismiss } from './useDismiss'

/**
 * Papperskorgen i startvyn: modellerna som tagits bort, i TRASH_DAYS dagar. Som startvyn,
 * med samma rutor, men en modell här öppnas inte: den tas tillbaka eller raderas för gott.
 */
export function TrashView() {
  const trash = useLibraryStore((s) => s.trash)
  const partial = useLibraryStore((s) => s.trashPartial)
  // Frågan innan något raderas för gott: en modell, eller alla.
  const [confirm, setConfirm] = useState<{ ids: string[]; text: string } | null>(null)

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-canvas print:hidden">
      <header className="flex items-center gap-2 border-b border-line bg-panel px-2 py-1.5 pt-[max(6px,env(safe-area-inset-top))]">
        <button className={`${ghostButton} pl-1.5 text-accent`} onClick={() => showTrash(false)}>
          <ChevronLeft size={22} strokeWidth={1.75} aria-hidden />
          <span className="narrow:hidden">Alla modeller</span>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold narrow:text-center">Papperskorgen</h1>
        <button
          className={quietDangerButton}
          disabled={!trash?.length}
          onClick={() =>
            trash &&
            setConfirm({
              ids: trash.map((t) => t.id),
              text:
                trash.length === 1
                  ? `”${trash[0]!.name}” raderas för gott. Det går inte att ångra.`
                  : `Alla ${trash.length} modeller i papperskorgen raderas för gott. Det går inte att ångra.`,
            })
          }
        >
          Töm
        </button>
      </header>
      <main className="relative min-h-0 flex-1 overflow-y-auto p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <Notices />
        <p className="mb-4 text-[13px] text-muted">
          Modeller du tar bort ligger här i {TRASH_DAYS} dagar. Sedan raderas de för gott.
        </p>
        {partial && (
          <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
            Ingen kontakt med servern. Det som tagits bort på andra enheter syns inte nu.
          </p>
        )}
        {trash === null ? (
          <p className="flex items-center justify-center gap-2 py-16 text-muted" role="status">
            <LoaderCircle size={18} className="animate-spin" aria-hidden />
            Läser in …
          </p>
        ) : trash.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted">
            <Trash2 size={40} strokeWidth={1.25} className="text-faint" aria-hidden />
            Papperskorgen är tom.
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-4 gap-y-5 narrow:grid-cols-2 narrow:gap-x-3">
            {trash.map((t) => (
              <TrashTile
                key={t.id}
                item={t}
                onDelete={() =>
                  setConfirm({ ids: [t.id], text: `”${t.name}” raderas för gott. Det går inte att ångra.` })
                }
              />
            ))}
          </ul>
        )}
      </main>
      {confirm && (
        <ConfirmDelete
          text={confirm.text}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            void deleteForever(confirm.ids)
          }}
        />
      )}
    </div>
  )
}

/** Hur länge modellen ligger kvar. En som väntar på synk har hela tiden kvar. */
function remaining(item: TrashListItem): string {
  const days = daysLeft(item.deletedAt, new Date())
  return days <= 1 ? 'Raderas inom ett dygn' : `${days} dagar kvar`
}

function TrashTile({ item, onDelete }: { item: TrashListItem; onDelete: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLLIElement>(null)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  useDismiss(menuRef, menuOpen, closeMenu)

  return (
    <li ref={menuRef} className="relative min-w-0">
      {/* Bilden öppnar menyn: en modell i papperskorgen öppnas inte. */}
      <button
        className="block w-full cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-accent"
        aria-label={`Ta tillbaka eller radera ${item.name}`}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border border-line bg-panel">
          {item.thumb ? (
            <img
              src={item.thumb}
              alt=""
              draggable={false}
              className="size-full object-contain opacity-60 select-none [-webkit-touch-callout:none]"
            />
          ) : (
            <Box size={40} strokeWidth={1.25} className="text-faint" aria-hidden />
          )}
        </div>
      </button>
      <div className="mt-1.5 flex items-start gap-1">
        <div className="min-w-0 flex-1 pl-0.5">
          <p className="truncate font-medium" title={item.name}>
            {item.name}
          </p>
          <p className="truncate text-xs text-faint tabular-nums">{remaining(item)}</p>
        </div>
        <button
          className="grid size-8 cursor-pointer place-items-center rounded-md text-muted hover:bg-hover narrow:size-11"
          aria-label={`Mer för ${item.name}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Ellipsis size={18} aria-hidden />
        </button>
      </div>
      {menuOpen && (
        <div className="absolute top-full right-0 z-10 mt-1 w-52 rounded-lg border border-line bg-panel py-1 shadow-lg">
          <MenuItem
            Icon={ArchiveRestore}
            onClick={() => {
              setMenuOpen(false)
              void restoreFromTrash(item.id)
            }}
          >
            Ta tillbaka
          </MenuItem>
          <MenuItem
            Icon={Trash2}
            danger
            onClick={() => {
              setMenuOpen(false)
              onDelete()
            }}
          >
            Radera för gott …
          </MenuItem>
        </div>
      )}
    </li>
  )
}

/** Frågan innan något raderas för gott. Esc eller ett tryck utanför avbryter. */
function ConfirmDelete({ text, onCancel, onConfirm }: { text: string; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
      onPointerDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-text"
        className="flex w-[min(360px,100%)] flex-col gap-3 rounded-xl border border-line bg-panel p-5 shadow-2xl"
      >
        <h2 id="confirm-delete-title" className="text-base font-semibold">
          Radera för gott?
        </h2>
        <p id="confirm-delete-text" className="text-muted">
          {text}
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <button className={secondaryButton} onClick={onCancel} autoFocus>
            Avbryt
          </button>
          <button className={dangerButton} onClick={onConfirm}>
            Radera
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
