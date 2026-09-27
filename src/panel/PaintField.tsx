import { Ban, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { paintChoices, type PaintChoice } from '../model/catalog'
import type { Paint, PartDef } from '../model/types'
import { useCatalogStore } from '../store/catalogStore'
import { useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { ColorInput } from './ColorInput'
import { CommitField } from './CommitField'
import { Tip } from './Tip'
import { fieldLabel, primaryButton, secondaryButton } from './ui'

/** En varmvit, vanlig på montrar: färgen en egen färg börjar med när delen inte har någon. */
const FIRST_COLOR = '#f1efe9'

const ICON_SM = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

const same = (a: Paint, b: Paint) => a.color === b.color && (a.code ?? '') === (b.code ?? '')

/** "Mörkblå · NCS S 7020-B": det som står när man pekar på en färgruta. */
const choiceLabel = (c: PaintChoice) => [c.name, c.paint.code].filter(Boolean).join(' · ') || c.paint.color

/** En rund knapp i raderna med färger: en färgruta, Ingen färg eller +. */
const round =
  'grid size-9 shrink-0 cursor-pointer place-items-center rounded-full aria-pressed:ring-2 aria-pressed:ring-accent narrow:size-11'

/**
 * Färgen delen får: standardfärgerna på en rad och de som redan finns i
 * modellen på en till. + öppnar en egen färg: färgväljaren och koden man
 * beställer efter (fri text, t.ex. "NCS S 0502-Y"). Gäller formen, alltså
 * alla länkade kopior.
 */
export function PaintField({ instanceId, def }: { instanceId: string; def: PartDef }) {
  const updatePart = useDocumentStore((s) => s.updatePart)
  const doc = useDocumentStore((s) => s.doc)
  const catalog = useCatalogStore((s) => s.catalog)
  const paint = def.paint
  const { standard, model } = useMemo(() => paintChoices(catalog, doc), [catalog, doc])
  // Rutan för en egen färg: ny (+) eller den valda ändrad (ett tryck till på den).
  const [custom, setCustom] = useState<'new' | 'edit' | null>(null)

  // Bara delens egna färger (raden I modellen) går att ändra med ett tryck till; standardfärgerna ändras i Material och färger.
  const swatch = (c: PaintChoice, editable: boolean) => {
    const chosen = !!paint && same(c.paint, paint)
    return (
      <Tip
        key={`${c.paint.color}|${c.paint.code ?? ''}`}
        label={chosen && editable ? `${choiceLabel(c)}: tryck för att ändra` : choiceLabel(c)}
      >
        <button
          aria-label={choiceLabel(c)}
          aria-pressed={chosen}
          onClick={() => {
            // Ett tryck till på den valda: ändra delens färg, med färgväljaren och koden.
            if (chosen) return editable && setCustom(custom === 'edit' ? null : 'edit')
            updatePart(instanceId, { paint: c.paint })
            setCustom(null)
          }}
          className={round}
        >
          <span
            className="size-7 rounded-full ring-1 ring-black/15 ring-inset narrow:size-8"
            style={{ background: c.paint.color }}
          />
        </button>
      </Tip>
    )
  }

  return (
    <div className={fieldLabel}>
      Färg
      <div className="flex flex-wrap items-center gap-1">
        <Tip label="Ingen färg: materialets egen">
          <button
            aria-label="Ingen färg"
            aria-pressed={!paint}
            onClick={() => updatePart(instanceId, { paint: undefined })}
            className={`${round} text-muted`}
          >
            <Ban size={22} strokeWidth={1.5} aria-hidden />
          </button>
        </Tip>
        {standard.map((c) => swatch(c, false))}
        <Tip label="Egen färg">
          <button
            aria-label="Egen färg"
            aria-expanded={custom === 'new'}
            onClick={() => setCustom(custom === 'new' ? null : 'new')}
            className={`${round} bg-button text-ink hover:bg-hover`}
          >
            <Plus {...ICON_SM} />
          </button>
        </Tip>
      </div>
      {model.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-full text-xs text-faint">I modellen</span>
          {model.map((c) => swatch(c, true))}
        </div>
      )}
      {custom && (
        <CustomColor
          // En ny ruta för varje del och läge: utkastet börjar om.
          key={`${def.id}|${custom}`}
          initial={custom === 'edit' && paint ? paint : { color: FIRST_COLOR }}
          onUse={(p) => {
            updatePart(instanceId, { paint: p })
            setCustom(null)
          }}
          onCancel={() => setCustom(null)}
        />
      )}
      <button
        className="inline-flex h-8 cursor-pointer items-center self-start text-accent narrow:h-10"
        onClick={() => useLibraryStore.getState().set({ catalogOpen: 'colors' })}
      >
        Redigera färglistan…
      </button>
    </div>
  )
}

/**
 * En egen färg för delen: färgväljare och kod. Standardfärgerna ändras inte
 * här, bara under Material och färger.
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
