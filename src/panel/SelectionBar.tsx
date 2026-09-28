import {
  ArrowUpFromLine,
  Boxes,
  ChevronDown,
  Copy,
  Ellipsis,
  Eye,
  EyeOff,
  ScanEye,
  Focus,
  Move,
  Puzzle,
  SquareDashedMousePointer,
  SquaresSubtract,
  SquaresUnite,
  Trash2,
  TrianglesCenterlineDashedHorizontal,
  TrianglesCenterlineDashedVertical,
  Unlink,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { resolveBodies } from '../model/resolve'
import type { WorldAxis } from '../model/types'
import { selectedBodyIds, useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { beginPushPull, hideSelection, isolateSelection, selectConnected } from '../tools/actions'
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
  'flex h-12 min-w-12 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-1.5 hover:bg-hover aria-expanded:bg-accent-soft aria-expanded:text-accent aria-pressed:bg-accent-soft aria-pressed:text-accent narrow:h-11'

/** Knappar som på telefon ligger under Mer i stället. */
const wideOnly = 'narrow:hidden'

/** Delens namn i en menytext: halvfet, som i Egenskaper, så att det skiljer sig från orden runt. */
function PartName({ name }: { name: string }) {
  return <span className="font-semibold">{name}</span>
}

/** menu: knappen öppnar en meny, och en liten pil nedåt står efter ordet. */
function BarLabel({ Icon, short, menu = false }: { Icon: LucideIcon; short: string; menu?: boolean }) {
  return (
    <>
      <Icon {...ICON} />
      <span className="flex items-center gap-0.5 text-[11px] leading-none">
        {short}
        {menu && <ChevronDown size={10} strokeWidth={2.25} aria-hidden className="opacity-60" />}
      </span>
    </>
  )
}

function BarButton({
  label,
  short = label,
  Icon,
  onClick,
  danger = false,
  pressed,
  className = '',
}: {
  label: string
  /** Ordet under ikonen, om namnet är för långt. */
  short?: string
  Icon: LucideIcon
  onClick: () => void
  danger?: boolean
  /** Knappen slår av och på ett läge (Välj fler). */
  pressed?: boolean
  className?: string
}) {
  return (
    <Tip label={label}>
      <button
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className={`${barIcon} ${danger ? 'text-danger' : ''} ${className}`}
      >
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
          <BarLabel Icon={SquaresUnite} short="Forma" menu />
        </button>
      </Tip>
      {open && (
        // Åt höger från knappen: raden står vid vänsterkanten.
        <div className="absolute top-full left-0 z-50 mt-1 w-max min-w-40 rounded-lg border border-line bg-panel p-1 shadow-lg">
          <MenuItem Icon={SquaresSubtract} onClick={() => choose('subtract')}>
            Skär ut en del ur <PartName name={name} />
          </MenuItem>
          <MenuItem Icon={SquaresUnite} onClick={() => choose('add')}>
            Lägg ihop en del med <PartName name={name} />
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
          <BarLabel Icon={Eye} short="Visa" menu />
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

/** Speglingarna, i planet genom det valdas mitt: tvärs mot x, z och y. Ikonen visar spegelns linje. */
const MIRRORS: readonly { axis: WorldAxis; label: string; Icon: LucideIcon }[] = [
  { axis: 'x', label: 'Vänster–höger', Icon: TrianglesCenterlineDashedVertical },
  { axis: 'z', label: 'Fram–bak', Icon: TrianglesCenterlineDashedVertical },
  { axis: 'y', label: 'Upp–ner', Icon: TrianglesCenterlineDashedHorizontal },
]

/** Speglar det valda på stället. En länkad kopia förblir länkad, men spegelvänd (vänster och höger sida). */
const mirrorSelection = (axis: WorldAxis) => {
  const s = useDocumentStore.getState()
  s.mirrorInstances(selectedBodyIds(s), axis)
}

function MirrorMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  return (
    <div ref={ref} className={`relative shrink-0 ${wideOnly}`}>
      <Tip label="Spegla">
        <button aria-label="Spegla" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={barIcon}>
          <BarLabel Icon={TrianglesCenterlineDashedVertical} short="Spegla" menu />
        </button>
      </Tip>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-max min-w-40 rounded-lg border border-line bg-panel p-1 shadow-lg">
          {MIRRORS.map(({ axis, label, Icon }) => (
            <MenuItem
              key={axis}
              Icon={Icon}
              onClick={() => {
                close()
                mirrorSelection(axis)
              }}
            >
              {label}
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  )
}

/** Mer för flera valda, bara på telefon: Spegla och Visa, som på bred skärm har egna knappar. */
function MultiMoreMenu({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
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
          {MIRRORS.map(({ axis, label, Icon }) => (
            <MenuItem key={axis} Icon={Icon} onClick={run(() => mirrorSelection(axis))}>
              Spegla {label.toLowerCase()}
            </MenuItem>
          ))}
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
          <MenuItem Icon={Boxes} onClick={run(() => selectConnected(id))}>
            Välj allt som sitter ihop
          </MenuItem>
          <div role="separator" className="mx-2 my-1 h-px bg-line" />
          {MIRRORS.map(({ axis, label, Icon }) => (
            <MenuItem key={axis} Icon={Icon} onClick={run(() => mirrorSelection(axis))}>
              Spegla {label.toLowerCase()}
            </MenuItem>
          ))}
          <div role="separator" className="mx-2 my-1 h-px bg-line" />
          <MenuItem Icon={SquaresSubtract} onClick={run(() => setCombining({ op: 'subtract', host: id }))}>
            Skär ut en del ur <PartName name={name} />
          </MenuItem>
          <MenuItem Icon={SquaresUnite} onClick={run(() => setCombining({ op: 'add', host: id }))}>
            Lägg ihop en del med <PartName name={name} />
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
 * Är 3D-vyn för smal för raden och vyknapparna (Visa allt m.fl.) bredvid varandra står raden
 * under dem i stället. Bara på bred skärm: på smal står vyknapparna i en smal kolumn vid kanten.
 * 52rem ≈ raden (470 px) + vyknapparna med VR (325 px) + marginaler. VisibilityBar har samma gräns.
 */
const BELOW_VIEW_BUTTONS = 'min-[721px]:@max-[52rem]/view:top-[3.75rem]'

/**
 * Det man oftast gör med det valda, direkt i 3D-vyn: på mobil slipper man
 * öppna bladet. Uppe till vänster; uppe till höger ligger "Visa allt".
 * Utan delens namn, så att raden har samma bredd vad man än väljer: namnet står i Egenskaper.
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
  const also = useDocumentStore((s) => s.also)
  const duplicateSelection = useDocumentStore((s) => s.duplicateSelection)
  const adding = useToolStore((s) => s.adding)
  const setAdding = useToolStore((s) => s.setAdding)
  const setTool = useToolStore((s) => s.setTool)

  const cover = useCoversView<HTMLDivElement>()

  // Medan man väljer verktyg för Skär ut / Lägg till visas CombineBar i stället.
  if (!selection || opActive || combining) return null
  const body = selection.kind === 'body' ? resolveBodies(doc).find((b) => b.id === selection.id) : undefined
  if (selection.kind === 'body' && !body) return null
  const count = body ? 1 + also.length : 0
  // Välj fler: på pekskärm, där det inte finns Skift. Knappen visar hur många som är valda.
  const addButton = body && !body.tool && (
    <BarButton
      label={adding ? 'Klar med att välja' : 'Välj fler'}
      short={count > 1 ? `${count} valda` : 'Fler'}
      Icon={SquareDashedMousePointer}
      pressed={adding}
      onClick={() => setAdding(!adding)}
    />
  )
  const deselect = (
    <>
      {/*
        Avmarkera gör inget med delen, så den står för sig: bara ett kryss, som på en etikett.
        På smal skärm visas namnet vid delen i vyn, och ett tryck bredvid avmarkerar, så de två tas bort.
      */}
      <span aria-hidden className="mx-0.5 h-6 w-px bg-line narrow:hidden" />
      <Tip label="Avmarkera">
        <button
          aria-label="Avmarkera"
          onClick={() => {
            setAdding(false)
            select(null)
          }}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-hover hover:text-ink narrow:hidden"
        >
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
      </Tip>
    </>
  )
  const barClass = `absolute top-3 left-3 flex max-w-[calc(100%-24px)] items-center gap-0.5 rounded-lg border border-line bg-panel/95 p-0.5 shadow-md narrow:max-w-[calc(100%-80px)] ${BELOW_VIEW_BUTTONS}`

  // Flera valda: det som går att göra med alla på en gång. Tapp och Forma gäller en del och finns inte här.
  if (body && count > 1)
    return (
      <div ref={cover} role="toolbar" aria-label={`${count} valda delar`} className={barClass}>
        <BarButton
          label="Zooma till"
          short="Zooma"
          Icon={Focus}
          onClick={() => requestFit('selection')}
          className={wideOnly}
        />
        <BarButton label="Flytta eller vrid" short="Flytta" Icon={Move} onClick={() => setTool('move')} />
        <BarButton label="Länkade kopior" short="Kopia" Icon={Copy} onClick={duplicateSelection} />
        <MirrorMenu />
        <VisibilityMenu id={body.id} />
        <MultiMoreMenu id={body.id} />
        {addButton}
        <BarButton label={`Ta bort ${count} delar`} short="Ta bort" Icon={Trash2} onClick={deleteSelection} danger />
        {deselect}
      </div>
    )

  return (
    <div ref={cover} role="toolbar" aria-label="Det valda" className={barClass}>
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
              <MirrorMenu />
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
      {addButton}
      <BarButton label="Ta bort" Icon={Trash2} onClick={deleteSelection} danger />
      {body && !body.tool && (
        <MoreMenu
          id={body.id}
          name={body.name}
          onZoom={() => requestFit('selection')}
          onCopy={() => duplicateLinked(body.id)}
        />
      )}
      {deselect}
    </div>
  )
}
