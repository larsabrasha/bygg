import {
  ArrowUpFromLine,
  Copy,
  Eye,
  EyeOff,
  ScanEye,
  Focus,
  Puzzle,
  SquaresSubtract,
  SquaresUnite,
  Trash2,
  Unlink,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { resolveBodies } from '../model/resolve'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { beginPushPull, hideSelection, isolateSelection } from '../tools/actions'
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
      className={`flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 hover:bg-hover narrow:size-11 narrow:justify-center narrow:px-0 ${danger ? 'text-danger' : ''}`}
    >
      <Icon {...ICON} />
      {/* På smal skärm bara ikonen; namnet finns i aria-label. */}
      <span className="text-[13px] narrow:hidden">{label}</span>
    </button>
  )
}

/**
 * Skär ut och Lägg till: den andra delen blir ett verktyg som formar den valda
 * (och försvinner ur kaplistan), som Combine i Fusion. Tapp är något annat, en
 * fog mellan två delar, och har en egen knapp. Efter valet trycker man på den
 * andra delen (se CombineBar).
 */
function ShapeMenu({ hostId, name }: { hostId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  const setCombining = useToolStore((s) => s.setCombining)
  const choose = (op: 'subtract' | 'add') => {
    close()
    setCombining({ op, host: hostId })
  }
  return (
    <div ref={ref} className="relative shrink-0 narrow:static">
      <button
        aria-label="Forma"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 hover:bg-hover aria-expanded:bg-accent-soft aria-expanded:text-accent narrow:size-11 narrow:justify-center narrow:px-0"
      >
        <SquaresUnite {...ICON} />
        <span className="text-[13px] narrow:hidden">Forma</span>
      </button>
      {open && (
        // Åt vänster från knappen. På en telefon får den inte plats åt något håll från knappen;
        // där ligger den under radens vänsterkant (knappens ruta är inte positionerad, narrow:static).
        <div className="absolute top-full right-0 z-50 narrow:right-auto narrow:left-0 mt-1 w-max max-w-[calc(100vw-24px)] min-w-40 rounded-lg border border-line bg-panel p-1 shadow-lg">
          <MenuItem Icon={SquaresSubtract} onClick={() => choose('subtract')}>
            Skär ut en del ur {name}
          </MenuItem>
          <MenuItem Icon={SquaresUnite} onClick={() => choose('add')}>
            Lägg ihop en del med {name}
          </MenuItem>
        </div>
      )}
    </div>
  )
}

/**
 * Dölj och Isolera, som i Shapr3D: så når man sidor som skyms av andra delar.
 * Isolerat syns de andra genomskinliga och går inte att trycka på. I en meny, så att raden får plats på en telefon.
 * VisibilityBar visar att något är dolt och tar fram allt igen.
 */
function VisibilityMenu({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        aria-label="Visa"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 hover:bg-hover aria-expanded:bg-accent-soft aria-expanded:text-accent narrow:size-11 narrow:justify-center narrow:px-0"
      >
        <Eye {...ICON} />
        <span className="text-[13px] narrow:hidden">Visa</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-max min-w-40 rounded-lg border border-line bg-panel p-1 shadow-lg">
          <MenuItem
            Icon={ScanEye}
            onClick={() => {
              close()
              isolateSelection(id)
            }}
          >
            Isolera
          </MenuItem>
          <MenuItem
            Icon={EyeOff}
            onClick={() => {
              close()
              hideSelection(id)
            }}
          >
            Dölj
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
  const setCombining = useToolStore((s) => s.setCombining)
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
      <span className={`truncate px-2 text-[13px] font-semibold ${body ? 'narrow:hidden' : ''}`}>
        {body ? body.name : 'Skiss'}
      </span>
      {body ? (
        <>
          <BarButton label="Zooma till" Icon={Focus} onClick={() => requestFit('selection')} />
          {body.tool ? (
            // Ett verktyg: lossa det, så blir det en vanlig del igen.
            <BarButton label="Lossa" Icon={Unlink} onClick={() => detach(body.id)} />
          ) : (
            <>
              <BarButton label="Länkad kopia" Icon={Copy} onClick={() => duplicateLinked(body.id)} />
              <BarButton label="Tapp" Icon={Puzzle} onClick={() => setCombining({ op: 'joint', host: body.id })} />
              <ShapeMenu hostId={body.id} name={body.name} />
              <VisibilityMenu id={body.id} />
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
      {/*
        Avmarkera gör inget med delen, så den står för sig: bara ett kryss, som på en etikett.
        På smal skärm får sex knappar och namnet inte plats. Där visas namnet vid delen i vyn,
        och ett tryck bredvid avmarkerar, så de två tas bort.
      */}
      <span aria-hidden className="mx-0.5 h-6 w-px bg-line narrow:hidden" />
      <Tip label="Avmarkera">
        <button
          aria-label="Avmarkera"
          onClick={() => select(null)}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-hover hover:text-ink narrow:hidden"
        >
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
      </Tip>
    </div>
  )
}
