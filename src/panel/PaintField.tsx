import { Ban, ChevronDown, Plus } from 'lucide-react'
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/react-dom'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { paintChoices, type PaintChoice } from '../model/catalog'
import type { Paint, PartDef } from '../model/types'
import { useCatalogStore } from '../store/catalogStore'
import { useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { ColorInput } from './ColorInput'
import { CommitField } from './CommitField'
import { field, fieldLabel, groupTitle, primaryButton, secondaryButton } from './ui'

/** En varmvit, vanlig på montrar: färgen en egen färg börjar med när delen inte har någon. */
const FIRST_COLOR = '#f1efe9'

/** Listans minsta bredd i px. */
const LIST_MIN_WIDTH = 320

const ICON_SM = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

const same = (a: Paint, b: Paint) => a.color === b.color && (a.code ?? '') === (b.code ?? '')

const Dot = ({ color }: { color: string }) => (
  <span className="size-5 shrink-0 rounded-full ring-1 ring-ink/20 ring-inset" style={{ background: color }} />
)

/**
 * Färgen delen får. Hopfälld: en rad med den valda färgen, som materialväljaren.
 * Utfälld: standardfärgerna, de egna och de som finns i modellen, med namn och
 * kod (på touch finns inget verktygstips, och flera vita ser likadana ut).
 * + ger delen en egen färg: färgväljaren och koden man beställer efter (fri
 * text, t.ex. "NCS S 0502-Y"). Gäller formen, alltså alla länkade kopior.
 */
/** ids: flera valda delar, som alla får färgen; def är då den valdas, och dess färg visas. */
export function PaintField({ instanceId, def, ids }: { instanceId: string; def: PartDef; ids?: readonly string[] }) {
  const updateParts = useDocumentStore((s) => s.updateParts)
  const doc = useDocumentStore((s) => s.doc)
  const catalog = useCatalogStore((s) => s.catalog)
  const paint = def.paint
  const { builtIn, own, model } = useMemo(() => paintChoices(catalog, doc), [catalog, doc])
  const [open, setOpen] = useState(false)
  // Listan ligger ovanpå i en portal, fäst under raden: den knuffar inte ner panelen och klipps inte av
  // den. Den får sin egen scroll när den inte ryms, och vänder uppåt om det är trångt under.
  const anchor = useRef<HTMLButtonElement | null>(null)
  const list = useRef<HTMLDivElement | null>(null)
  const { refs, floatingStyles } = useFloating({
    open,
    placement: 'bottom-end',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, availableHeight, elements }) {
          // Minst så bred att de längsta koderna (NCS S 2030-Y20R) ryms i två spalter.
          elements.floating.style.width = `${Math.max(rects.reference.width, LIST_MIN_WIDTH)}px`
          elements.floating.style.maxHeight = `${Math.max(200, availableHeight)}px`
        },
      }),
    ],
  })
  // Stängs med ett tryck utanför (inte på raden, som själv växlar) och med Esc.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!anchor.current?.contains(t) && !list.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  // Rutan för en egen färg: ny (+) eller delens färg ändrad (ett tryck till på den i I modellen).
  const [custom, setCustom] = useState<'new' | 'edit' | null>(null)

  const current = paint && [...builtIn, ...own, ...model].find((c) => same(c.paint, paint))
  const currentName = paint ? (current?.name ?? paint.code ?? 'Egen färg') : 'Ingen färg'
  const currentCode = paint && current?.name ? paint.code : undefined

  const choose = (next: Paint | undefined) => {
    updateParts(ids ?? [instanceId], { paint: next })
    setOpen(false)
    setCustom(null)
  }

  const item = (c: PaintChoice, editable: boolean) => {
    const chosen = !!paint && same(c.paint, paint)
    const name = c.name ?? c.paint.code ?? 'Egen färg'
    const code = c.name ? c.paint.code : undefined
    return (
      <button
        key={`${c.paint.color}|${c.paint.code ?? ''}`}
        aria-pressed={chosen}
        onClick={() => {
          // Ett tryck till på delens egen färg: ändra den. Standardfärgerna ändras i Redigera färglistan.
          if (chosen && editable) {
            setOpen(false)
            return setCustom('edit')
          }
          choose(c.paint)
        }}
        className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-hover aria-pressed:bg-accent-soft narrow:min-h-11"
      >
        <Dot color={c.paint.color} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] text-ink">{name}</span>
          {code && <span className="block truncate text-[11px] text-muted">{code}</span>}
        </span>
      </button>
    )
  }

  const section = (title: string, children: ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <h4 className={`${groupTitle} px-2 pt-1.5`}>{title}</h4>
      <div className="grid grid-cols-2 gap-0.5">{children}</div>
    </div>
  )

  return (
    <div className={fieldLabel}>
      Färg
      <button
        ref={(el) => {
          anchor.current = el
          refs.setReference(el)
        }}
        className={`${field} flex cursor-pointer items-center gap-2 text-left`}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          setCustom(null)
        }}
      >
        {paint ? <Dot color={paint.color} /> : <Ban size={20} strokeWidth={1.5} aria-hidden className="text-muted" />}
        <span className="min-w-0 flex-1 truncate text-[13px]">
          {currentName}
          {currentCode && <span className="text-muted"> · {currentCode}</span>}
        </span>
        <ChevronDown size={16} aria-hidden className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open &&
        createPortal(
          <div
            ref={(el) => {
              list.current = el
              refs.setFloating(el)
            }}
            style={floatingStyles}
            className="z-50 flex flex-col gap-2 overflow-y-auto rounded-lg border border-line bg-panel p-1.5 shadow-lg"
          >
            {section(
              'Standardfärger',
              <>
                <button
                  aria-pressed={!paint}
                  onClick={() => choose(undefined)}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] text-ink hover:bg-hover aria-pressed:bg-accent-soft narrow:min-h-11"
                >
                  <Ban size={20} strokeWidth={1.5} aria-hidden className="text-muted" />
                  Ingen färg
                </button>
                {builtIn.map((c) => item(c, false))}
              </>,
            )}
            {own.length > 0 &&
              section(
                'Egna färger',
                own.map((c) => item(c, false)),
              )}
            {model.length > 0 &&
              section(
                'I modellen',
                model.map((c) => item(c, true)),
              )}
            <div className="flex flex-wrap items-center gap-x-3 border-t border-line px-1 pt-1.5">
              <button
                className="inline-flex h-9 cursor-pointer items-center gap-1 text-[13px] text-accent narrow:h-11"
                onClick={() => {
                  setOpen(false)
                  setCustom('new')
                }}
              >
                <Plus {...ICON_SM} />
                Egen färg för delen
              </button>
              <button
                className="inline-flex h-9 cursor-pointer items-center text-[13px] text-accent narrow:h-11"
                onClick={() => {
                  setOpen(false)
                  useLibraryStore.getState().set({ settings: 'colors' })
                }}
              >
                Redigera färglistan…
              </button>
            </div>
          </div>,
          document.body,
        )}
      {custom && (
        <CustomColor
          // En ny ruta för varje del och läge: utkastet börjar om.
          key={`${def.id}|${custom}`}
          initial={custom === 'edit' && paint ? paint : { color: FIRST_COLOR }}
          onUse={(p) => choose(p)}
          onCancel={() => setCustom(null)}
        />
      )}
    </div>
  )
}

/**
 * En egen färg för delen: färgväljare och kod. Standardfärgerna ändras inte
 * här, bara under Färger i Inställningar.
 */
function CustomColor({
  initial,
  onUse,
  onCancel,
}: {
  initial: Paint
  onUse: (p: Paint) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<Paint>(initial)
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-field p-2.5">
      <div className="flex items-center gap-2">
        <ColorInput label="Färg" value={draft.color} onCommit={(color) => setDraft({ ...draft, color })} />
        <div className="min-w-0 flex-1">
          <CommitField
            label="Färgkod"
            placeholder="Kod"
            value={draft.code ?? ''}
            onCommit={(t) => {
              const code = t.trim()
              setDraft({ color: draft.color, ...(code && { code }) })
              return null
            }}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button className={secondaryButton} onClick={onCancel}>
          Avbryt
        </button>
        <button className={primaryButton} onClick={() => onUse(draft)}>
          Använd
        </button>
      </div>
    </div>
  )
}
