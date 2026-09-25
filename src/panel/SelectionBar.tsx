import {
  ArrowUpFromLine,
  Copy,
  Focus,
  SquareMinus,
  Puzzle,
  SquarePlus,
  Trash2,
  Unlink,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { resolveBodies } from '../model/resolve'
import type { Combine } from '../model/types'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { beginPushPull } from '../tools/actions'
import { MenuItem } from './MenuItem'
import { Tip } from './Tip'
import { useDismiss } from './useDismiss'
import { useCoversView } from './useCoversView'

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const

function BarButton({
  label,
  Icon,
  onClick,
  danger = false,
}: {
  label: string
  Icon: LucideIcon
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 hover:bg-hover narrow:size-11 narrow:justify-center narrow:px-0 ${danger ? 'text-danger' : ''}`}
    >
      <Icon {...ICON} />
      {/* På smal skärm bara ikonen; namnet finns i aria-label. */}
      <span className="text-[13px] narrow:hidden">{label}</span>
    </button>
  )
}

/**
 * Skär ut, Lägg till och Tapp i en meny, så att raden får plats på en telefon.
 * Efter valet trycker man på den andra delen (se CombineBar).
 */
function JoinMenu({ hostId }: { hostId: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  const setCombining = useToolStore((s) => s.setCombining)
  const choose = (op: Combine['op']) => {
    close()
    setCombining({ op, host: hostId })
  }
  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Foga"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 hover:bg-hover aria-expanded:bg-accent-soft aria-expanded:text-accent narrow:size-11 narrow:justify-center narrow:px-0"
      >
        <Puzzle {...ICON} />
        <span className="text-[13px] narrow:hidden">Foga</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-60 rounded-lg border border-line bg-panel p-1 shadow-lg">
          <MenuItem Icon={Puzzle} onClick={() => choose('joint')}>
            Tapp i en annan del
          </MenuItem>
          <MenuItem Icon={SquareMinus} onClick={() => choose('subtract')}>
            Skär ut en annan del
          </MenuItem>
          <MenuItem Icon={SquarePlus} onClick={() => choose('add')}>
            Lägg till en annan del
          </MenuItem>
        </div>
      )}
    </div>
  )
}

/**
 * Det man oftast gör med det valda, direkt i 3D-vyn: på mobil slipper man
 * öppna bladet. Uppe till vänster; uppe till höger ligger "Visa allt".
 */
export function SelectionBar() {
  const selection = useDocumentStore((s) => s.selection)
  const doc = useDocumentStore((s) => s.doc)
  const select = useDocumentStore((s) => s.select)
  const deleteSelection = useDocumentStore((s) => s.deleteSelection)
  const duplicateLinked = useDocumentStore((s) => s.duplicateLinked)
  const requestFit = useViewStore((s) => s.requestFit)
  const opActive = useToolStore((s) => s.op !== null)
  const combining = useToolStore((s) => s.combining)
  const detach = useDocumentStore((s) => s.detach)

  const cover = useCoversView<HTMLDivElement>()

  // Medan man väljer verktyg för Skär ut / Lägg till visas CombineBar i stället.
  if (!selection || opActive || combining) return null
  const body = selection.kind === 'body' ? resolveBodies(doc).find((b) => b.id === selection.id) : undefined
  if (selection.kind === 'body' && !body) return null

  return (
    <div
      ref={cover}
      role="toolbar"
      aria-label="Det valda"
      className="absolute top-3 left-3 flex max-w-[calc(100%-190px)] narrow:max-w-[calc(100%-80px)] items-center gap-0.5 rounded-lg border border-line bg-panel/95 p-0.5 shadow-md"
    >
      <span className="truncate px-2 text-[13px] font-semibold narrow:max-w-20">{body ? body.name : 'Skiss'}</span>
      {body ? (
        <>
          <BarButton label="Zooma till" Icon={Focus} onClick={() => requestFit('selection')} />
          {body.tool ? (
            // Ett verktyg: lossa det, så blir det en vanlig del igen.
            <BarButton label="Lossa" Icon={Unlink} onClick={() => detach(body.id)} />
          ) : (
            <>
              <BarButton label="Länkad kopia" Icon={Copy} onClick={() => duplicateLinked(body.id)} />
              <JoinMenu hostId={body.id} />
            </>
          )}
        </>
      ) : (
        <BarButton
          label="Dra ut"
          Icon={ArrowUpFromLine}
          onClick={() => beginPushPull({ kind: 'sketch', id: selection.id })}
        />
      )}
      <BarButton label="Ta bort" Icon={Trash2} onClick={deleteSelection} danger />
      {/* Avmarkera gör inget med delen, så den står för sig: bara ett kryss, som på en etikett. */}
      <span aria-hidden className="mx-0.5 h-6 w-px bg-line" />
      <Tip label="Avmarkera">
        <button
          aria-label="Avmarkera"
          onClick={() => select(null)}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-hover hover:text-ink narrow:size-11"
        >
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
      </Tip>
    </div>
  )
}
