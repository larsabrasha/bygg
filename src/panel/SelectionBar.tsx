import {
  ArrowUpFromLine,
  Copy,
  Ellipsis,
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

/**
 * Ikon med ett kort ord under, som i en flikrad i iOS: med hela namnet bredvid
 * blev raden så lång att den täckte Visa allt, och bara ikoner gick inte att
 * förstå på en pekskärm, där tipsen inte visas. På telefon står bara det
 * vanligaste i raden och resten under Mer (MoreMenu), så orden ryms där också.
 * Hela namnet står i tipset och i aria-label.
 */
const barIcon =
  'flex h-12 min-w-12 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-1.5 hover:bg-hover aria-expanded:bg-accent-soft aria-expanded:text-accent narrow:h-11'

/** Knappar som på telefon ligger under Mer i stället. */
const wideOnly = 'narrow:hidden'

function BarLabel({ Icon, short }: { Icon: LucideIcon; short: string }) {
  return (
    <>
      <Icon {...ICON} />
      <span className="text-[11px] leading-none">{short}</span>
    </>
  )
}

function BarButton({
  label,
  short = label,
  Icon,
  onClick,
  danger = false,
  className = '',
}: {
  label: string
  /** Ordet under ikonen, om namnet är för långt. */
  short?: string
  Icon: LucideIcon
  onClick: () => void
  danger?: boolean
  className?: string
}) {
  return (
    <Tip label={label}>
      <button aria-label={label} onClick={onClick} className={`${barIcon} ${danger ? 'text-danger' : ''} ${className}`}>
        <BarLabel Icon={Icon} short={short} />
      </button>
    </Tip>
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
    <div ref={ref} className={`relative shrink-0 ${wideOnly}`}>
      <Tip label="Forma">
        <button aria-label="Forma" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={barIcon}>
          <BarLabel Icon={SquaresUnite} short="Forma" />
        </button>
      </Tip>
      {open && (
        // Åt höger från knappen: raden står vid vänsterkanten.
        <div className="absolute top-full left-0 z-50 mt-1 w-max min-w-40 rounded-lg border border-line bg-panel p-1 shadow-lg">
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
    <div ref={ref} className={`relative shrink-0 ${wideOnly}`}>
      <Tip label="Visa">
        <button aria-label="Visa" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={barIcon}>
          <BarLabel Icon={Eye} short="Visa" />
        </button>
      </Tip>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-max min-w-40 rounded-lg border border-line bg-panel p-1 shadow-lg">
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
 * Mer, bara på telefon: det som på bred skärm har egna knappar, med hela namnen.
 * Menyn ligger under radens vänsterkant (knappens ruta är inte positionerad),
 * eftersom den inte får plats från knappen.
 */
function MoreMenu({ id, name, onZoom, onCopy }: { id: string; name: string; onZoom: () => void; onCopy: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  const setCombining = useToolStore((s) => s.setCombining)
  const run = (action: () => void) => () => {
    close()
    action()
  }
  return (
    <div ref={ref} className="hidden shrink-0 narrow:block">
      <button aria-label="Mer" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={barIcon}>
        <BarLabel Icon={Ellipsis} short="Mer" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-max max-w-[calc(100vw-24px)] min-w-48 rounded-lg border border-line bg-panel p-1 shadow-lg">
          <MenuItem Icon={Focus} onClick={run(onZoom)}>
            Zooma till
          </MenuItem>
          <MenuItem Icon={Copy} onClick={run(onCopy)}>
            Länkad kopia
          </MenuItem>
          <div role="separator" className="mx-2 my-1 h-px bg-line" />
          <MenuItem Icon={SquaresSubtract} onClick={run(() => setCombining({ op: 'subtract', host: id }))}>
            Skär ut en del ur {name}
          </MenuItem>
          <MenuItem Icon={SquaresUnite} onClick={run(() => setCombining({ op: 'add', host: id }))}>
            Lägg ihop en del med {name}
          </MenuItem>
          <div role="separator" className="mx-2 my-1 h-px bg-line" />
          <MenuItem Icon={ScanEye} onClick={run(() => isolateSelection(id))}>
            Isolera
          </MenuItem>
          <MenuItem Icon={EyeOff} onClick={run(() => hideSelection(id))}>
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
          {/* Ett verktyg har få knappar; de ryms också på telefon. */}
          <BarButton
            label="Zooma till"
            short="Zooma"
            Icon={Focus}
            onClick={() => requestFit('selection')}
            className={body.tool ? '' : wideOnly}
          />
          {body.tool ? (
            // Ett verktyg: lossa det, så blir det en vanlig del igen.
            <BarButton label="Lossa" Icon={Unlink} onClick={() => detach(body.id)} />
          ) : (
            <>
              <BarButton
                label="Länkad kopia"
                short="Kopia"
                Icon={Copy}
                onClick={() => duplicateLinked(body.id)}
                className={wideOnly}
              />
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
      {body && !body.tool && (
        <MoreMenu
          id={body.id}
          name={body.name}
          onZoom={() => requestFit('selection')}
          onCopy={() => duplicateLinked(body.id)}
        />
      )}
      {/*
        Avmarkera gör inget med delen, så den står för sig: bara ett kryss, som på en etikett.
        På smal skärm visas namnet vid delen i vyn, och ett tryck bredvid avmarkerar, så de två tas bort.
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
