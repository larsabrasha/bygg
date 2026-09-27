import { ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  BUILT_IN_COLORS,
  parseSheets,
  parseThicknesses,
  type CatalogColor,
  type CatalogMaterial,
} from '../model/catalog'
import { firstUpper, MATERIAL_GROUPS, MATERIAL_SPECS, type MaterialKind, type MaterialSpec } from '../model/materials'
import { numberFormat } from '../model/numberFormat'
import { useCatalogStore } from '../store/catalogStore'
import { ColorInput } from './ColorInput'
import { CommitField } from './CommitField'
import { Switch } from './Switch'
import { Tip } from './Tip'
import {
  groupTitle,
  iconAction,
  listCard,
  listRow,
  selectableListRow,
  primaryButton,
  quietDangerButton,
  secondaryButton,
} from './ui'

const num = numberFormat(1)
const ICON_SM = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

/** Slagen som de heter i listrutan och på materialets rad. Korta, så att listan inte radbryts på iOS. */
const KIND_LABEL: Record<MaterialKind, string> = {
  wood: 'Massivt trä',
  sheet: 'Skiva',
  ordered: 'Till mått',
}

/** Vid varje slag i formuläret: vad det betyder för kaplistan och kapschemat (se model/cutPlan). Kort, det ska gå att se i farten. */
const KIND_HINT: Record<MaterialKind, string> = {
  wood: 'Kapas ur brädor, hyvlas vid behov',
  sheet: 'Läggs ut på hela skivor',
  ordered: 'Glas, sten – varje del för sig',
}

/** Ett nytt eget material: en skiva, som de flesta egna material i en verkstad är. */
const NEW_MATERIAL = {
  name: 'Nytt material',
  kind: 'sheet' as const,
  grain: false,
  thicknesses: [12, 16, 19],
  sheets: [{ length: 2440, width: 1220 }],
  color: '#b89770',
}

/** Genomskinligt material (glas, akryl): så mycket syns av ytan i 3D-vyn. */
const CLEAR_OPACITY = 0.3

/*
 * Sidorna Material och Färger i Inställningar (SettingsSheet): användarens egna material och de
 * inbyggda som ska synas i väljaren, och standardfärgerna. Hör till användaren och gäller alla modeller.
 */

type MaterialFields = Omit<MaterialSpec, 'id'>

export function Materials() {
  const catalog = useCatalogStore((s) => s.catalog)
  const addMaterial = useCatalogStore((s) => s.addMaterial)
  const setHidden = useCatalogStore((s) => s.setHidden)
  const updateMaterial = useCatalogStore((s) => s.updateMaterial)
  const removeMaterial = useCatalogStore((s) => s.removeMaterial)
  // Materialet som är öppet i en egen ruta. Försvinner det (t.ex. borttaget på en annan enhet) stängs rutan.
  const [editing, setEditing] = useState<string | null>(null)
  const edited = catalog.materials.find((m) => m.id === editing)
  // Ett nytt material är ett utkast tills man trycker Lägg till.
  const [draft, setDraft] = useState<MaterialFields | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className={groupTitle}>Egna material</h3>
        {catalog.materials.length === 0 ? (
          <p className="text-[13px] text-muted">
            Lägg till det verkstaden har på lager, med tjocklekar och skivmått. Det syns i materialväljaren i alla
            modeller.
          </p>
        ) : (
          <div className={listCard}>
            {catalog.materials.map((m) => (
              <MaterialRow key={m.id} material={m} onOpen={() => setEditing(m.id)} />
            ))}
          </div>
        )}
        <button className={`${secondaryButton} self-start`} onClick={() => setDraft(NEW_MATERIAL)}>
          <Plus {...ICON_SM} />
          Nytt material
        </button>
      </section>

      {edited && (
        <MaterialDialog
          title={firstUpper(edited.name)}
          value={edited}
          onChange={(patch) => updateMaterial(edited.id, patch)}
          onClose={() => setEditing(null)}
        >
          <div className="flex items-center justify-between gap-2 pl-3">
            <p className="text-xs text-faint">Delar som har materialet behåller det, också om du tar bort det.</p>
            <button
              className={quietDangerButton}
              onClick={() => {
                removeMaterial(edited.id)
                setEditing(null)
              }}
            >
              <Trash2 {...ICON_SM} />
              Ta bort
            </button>
          </div>
        </MaterialDialog>
      )}
      {draft && (
        <MaterialDialog
          title="Nytt material"
          value={draft}
          onChange={(patch) => setDraft({ ...draft, ...patch })}
          onClose={() => setDraft(null)}
        >
          <div className="flex justify-end gap-2">
            <button className={secondaryButton} onClick={() => setDraft(null)}>
              Avbryt
            </button>
            <button
              className={primaryButton}
              onClick={() => {
                addMaterial(draft)
                setDraft(null)
              }}
            >
              Lägg till
            </button>
          </div>
        </MaterialDialog>
      )}

      <section className="flex flex-col gap-1">
        <AllHeader title="Inbyggda material" ids={MATERIAL_SPECS.map((m) => m.id)} />
        <p className="mb-1 text-[13px] text-muted">
          Slå av dem du aldrig använder, så syns de inte i väljaren. Delar som redan har dem behåller dem.
        </p>
        {MATERIAL_GROUPS.map((g) => (
          <div key={g.kind} className="mt-2 flex flex-col gap-1">
            {/* Samma grupper och namn som i materialväljaren i Egenskaper. */}
            <h4 className="px-3 text-xs font-semibold text-muted">{g.title}</h4>
            <ShownList>
              {MATERIAL_SPECS.filter((m) => m.kind === g.kind).map((m) => (
                <ShownRow
                  key={m.id}
                  color={m.color}
                  name={firstUpper(m.name)}
                  // Slaget står i gruppens rubrik; här bara det kapschemat räknar med.
                  detail={stockSummary(m)}
                  shown={!catalog.hidden.includes(m.id)}
                  onChange={(on) => setHidden(m.id, !on)}
                />
              ))}
            </ShownList>
          </div>
        ))}
      </section>
    </div>
  )
}

const Swatch = ({ color, round = false }: { color: string; round?: boolean }) => (
  <span
    className={`size-3.5 shrink-0 ring-1 ring-black/15 ring-inset ${round ? 'rounded-full' : 'rounded-[3px]'}`}
    style={{ background: color }}
  />
)

/** Rubriken över de inbyggda, med Alla: av om alla visas, annars på för alla. */
function AllHeader({ title, ids }: { title: string; ids: readonly string[] }) {
  const hidden = useCatalogStore((s) => s.catalog.hidden)
  const setHiddenMany = useCatalogStore((s) => s.setHiddenMany)
  const allShown = ids.every((id) => !hidden.includes(id))
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className={groupTitle}>{title}</h3>
      <Switch checked={allShown} onChange={(on) => setHiddenMany(ids, !on)}>
        Alla
      </Switch>
    </div>
  )
}

/** Ett kort med inbyggda saker, som korten i kaplistan. */
const ShownList = ({ children }: { children: ReactNode }) => <div className={listCard}>{children}</div>

/** En inbyggd sak (material eller färg) med Visas: av betyder att den inte syns i väljaren. */
function ShownRow({
  color,
  name,
  note,
  detail,
  shown,
  round,
  onChange,
}: {
  color: string
  name: string
  note?: string
  /** En rad under namnet, t.ex. materialets mått. */
  detail?: string
  shown: boolean
  round?: boolean
  onChange: (shown: boolean) => void
}) {
  return (
    <div className={`${listRow} flex items-center gap-2 px-3 py-1`}>
      <Swatch color={color} round={round} />
      <span className="min-w-0 flex-1 text-[13px]">
        {name}
        {note && <span className="ml-2 text-xs text-muted">{note}</span>}
        {detail && <span className="block text-xs text-muted tabular-nums">{detail}</span>}
      </span>
      <Switch checked={shown} onChange={onChange}>
        Visas
      </Switch>
    </div>
  )
}

/** "12, 16, 19 mm · 2 440 × 1 220": det kapschemat räknar med. Tomt för massivt trä (standardvirke). */
function stockSummary(m: MaterialFields): string {
  const list = m.kind !== 'wood' ? (m.thicknesses ?? []) : []
  // Semikolon mellan talen när något har decimalkomma: "2,4; 3; 6", inte "2,4, 3, 6".
  const sep = list.some((t) => !Number.isInteger(t)) ? '; ' : ', '
  const thick = list.length ? `${list.map((t) => num.format(t)).join(sep)} mm` : ''
  const sheet =
    m.kind === 'sheet' && m.sheets?.[0] ? `${num.format(m.sheets[0].length)} × ${num.format(m.sheets[0].width)}` : ''
  return [thick, sheet].filter(Boolean).join(' · ')
}

/** "Skiva · 12, 16, 19 mm · 2 440 × 1 220": det viktigaste om ett material på en rad. */
function summary(m: MaterialFields): string {
  return [KIND_LABEL[m.kind], stockSummary(m)].filter(Boolean).join(' · ')
}

/** Ett eget material i listan. Ett tryck öppnar det i en egen ruta, så att listan ligger still. */
function MaterialRow({ material: m, onOpen }: { material: CatalogMaterial; onOpen: () => void }) {
  return (
    <button
      className={`${selectableListRow} flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left hover:bg-button`}
      onClick={onOpen}
    >
      <Swatch color={m.color} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">{firstUpper(m.name)}</span>
        <span className="block text-xs text-muted tabular-nums">{summary(m)}</span>
      </span>
      <ChevronRight size={16} aria-hidden className="text-muted" />
    </button>
  )
}

/**
 * Ett material i en egen ruta ovanpå Inställningar, som den rutan själv: mitt på skärmen,
 * på smal skärm hela skärmen. Esc stänger bara den här rutan. children står under fälten.
 */
function MaterialDialog({
  title,
  value,
  onChange,
  onClose,
  children,
}: {
  title: string
  value: MaterialFields
  onChange: (patch: Partial<MaterialFields>) => void
  onClose: () => void
  children: ReactNode
}) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    // Före Inställningars egen lyssnare (capture), så att Esc inte stänger båda.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Ett fält med text att tömma (se Chips) får Esc först.
      const t = e.target
      if (t instanceof HTMLInputElement && t.dataset.escClears !== undefined && t.value) return
      e.stopPropagation()
      close.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  // Stängs av ett klick utanför, inte redan när fingret sätts ner: då hinner ett fält som har fokus spara.
  const downOutside = useRef(false)
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden narrow:items-stretch narrow:p-0"
      onPointerDown={(e) => (downOutside.current = e.target === e.currentTarget)}
      onClick={(e) => downOutside.current && e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        // Fast höjd, efter det högsta slaget (Skiva): rutan ska inte hoppa när man byter slag och fälten ändras.
        className="flex h-[min(100%,var(--material-dialog-h))] w-[min(440px,100%)] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl [--material-dialog-h:700px] narrow:h-dvh narrow:w-full narrow:rounded-none narrow:border-0"
      >
        <header className="flex items-center gap-2 border-b border-line px-4 py-2 pt-[max(8px,env(safe-area-inset-top))]">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
          <Tip label="Stäng">
            <button className={`${iconAction} hover:bg-hover`} aria-label="Stäng" onClick={onClose}>
              <X size={20} strokeWidth={1.75} aria-hidden />
            </button>
          </Tip>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <MaterialForm value={value} onChange={onChange} />
        </div>
        {/* Knapparna står still längst ner, vad slaget än är. */}
        <footer className="border-t border-line px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {children}
        </footer>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Fälten för ett material (se MaterialDialog), ordnade efter hur mycket de betyder: vad det heter och hur
 * det ser ut; slaget, som avgör vad resten betyder; och det som finns på lager, som brickor. Massivt trä
 * räknas på standardvirke och har alltid fiber, så där finns inget lager att fylla i. Inga rubriker på
 * grupperna: knapparna och fältens namn säger vad de är, luften mellan dem visar vad som hör ihop.
 */
function MaterialForm({
  value: m,
  onChange,
}: {
  value: MaterialFields
  onChange: (patch: Partial<MaterialFields>) => void
}) {
  const thicknesses = m.thicknesses ?? []
  const sheet = m.sheets?.[0]
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ColorInput label="Färg i 3D-vyn och listorna" value={m.color} onCommit={(color) => onChange({ color })} />
          <div className="min-w-0 flex-1">
            <CommitField
              label="Namn"
              placeholder="Namn"
              value={m.name}
              onCommit={(t) => {
                if (!t.trim()) return 'Namnet får inte vara tomt'
                onChange({ name: t.trim() })
                return null
              }}
            />
          </div>
        </div>
        {/* Bara utseendet i 3D-vyn: en liten knapp under färgen, inte en egen rad. */}
        <div className="-ml-2">
          <Switch
            checked={m.opacity !== undefined}
            onChange={(on) => onChange({ opacity: on ? CLEAR_OPACITY : undefined })}
          >
            Genomskinligt, som glas och akryl
          </Switch>
        </div>
      </div>

      {/* Slaget är ett val om vad materialet är, inte en vy att byta till: rader med förklaringen vid varje val. */}
      <div role="radiogroup" aria-label="Slag" className={listCard}>
        {(Object.keys(KIND_LABEL) as MaterialKind[]).map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={m.kind === k}
            className={`${selectableListRow} group/kind flex cursor-pointer items-start gap-3 px-3 py-2.5 text-left hover:bg-button aria-checked:bg-accent-soft aria-checked:before:hidden [[aria-checked=true]+&]:before:hidden`}
            // Massivt trä har alltid fiber och standardvirkets mått (se swedishStock).
            onClick={() => onChange(k === 'wood' ? { kind: k, grain: true } : { kind: k })}
          >
            <span
              aria-hidden
              className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 border-disabled group-aria-checked/kind:border-accent"
            >
              <span className="size-1.5 rounded-full bg-accent opacity-0 group-aria-checked/kind:opacity-100" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{KIND_LABEL[k]}</span>
              <span className="block text-xs text-muted">{KIND_HINT[k]}</span>
            </span>
          </button>
        ))}
      </div>

      {m.kind !== 'wood' && (
        <section className="flex flex-col gap-4">
          <Chips
            title="Tjocklekar"
            items={thicknesses.map((t) => `${num.format(t)} mm`)}
            onRemove={(i) => onChange({ thicknesses: thicknesses.filter((_, j) => j !== i) })}
            placeholder="t.ex. 22"
            inputWidth="w-24"
            onAdd={(t) => {
              const added = parseThicknesses(t)
              if (added.length === 0) return 'Skriv tjockleken i mm, t.ex. 22'
              onChange({ thicknesses: [...new Set([...thicknesses, ...added])].sort((a, b) => a - b) })
              return null
            }}
          />
          {/* Ett skivmått: kapschemat räknar på det. Säljs ett annat format blir det ett eget material. */}
          {m.kind === 'sheet' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Skivmått</span>
              <span className="w-48">
                <CommitField
                  value={sheet ? `${num.format(sheet.length)} × ${num.format(sheet.width)}` : ''}
                  suffix="mm"
                  placeholder="2440 × 1220"
                  onCommit={(t) => {
                    const [first] = parseSheets(t)
                    if (!first) return 'Skriv måttet som längd × bredd, t.ex. 2440 × 1220'
                    onChange({ sheets: [first] })
                    return null
                  }}
                />
              </span>
            </label>
          )}
          <div className="flex flex-col">
            <div className="-ml-2">
              {/* Egenskapen hos materialet (plywood ja, MDF nej), inte en instruktion; följden står under. */}
              <Switch checked={m.grain} onChange={(grain) => onChange({ grain })}>
                Har fiberriktning
              </Switch>
            </div>
            <p className="text-xs text-muted">
              {/* Fibern styr längden i kaplistan (partAxes.cutAxes) och, för skivor, om delarna får vridas i kapschemat. */}
              {m.kind === 'sheet'
                ? m.grain
                  ? 'Delarna läggs längs fibern och vrids inte på skivan.'
                  : 'Utan fiber får delarna vridas på skivan, så att de ryms bättre.'
                : m.grain
                  ? 'Längden i kaplistan mäts längs fibern.'
                  : 'Längden i kaplistan är den längsta sidan.'}
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * Måtten som finns på lager som brickor: ett kryss tar bort en, fältet sist lägger till (Enter eller
 * när fokus lämnar). Lättare att läsa än en rad med kommatecken.
 */
function Chips({
  title,
  items,
  onRemove,
  placeholder,
  inputWidth = 'w-40',
  onAdd,
}: {
  title: string
  items: string[]
  onRemove: (index: number) => void
  placeholder: string
  /** Bredden på fältet för en ny, efter hur långt det man skriver är. */
  inputWidth?: string
  /** Returnerar felmeddelande, eller null om det lades till. */
  onAdd: (text: string) => string | null
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = () => {
    if (!text.trim()) return setError(null)
    const e = onAdd(text)
    setError(e)
    if (!e) setText('')
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium">{title}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <span
            key={item}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-button pl-3 text-[13px] tabular-nums narrow:h-9"
          >
            {item}
            <button
              className="grid size-7 cursor-pointer place-items-center rounded-full text-muted hover:bg-hover hover:text-ink narrow:size-8"
              aria-label={`Ta bort ${item}`}
              onClick={() => onRemove(i)}
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          </span>
        ))}
        <input
          aria-label={`Lägg till ${title.toLowerCase()}`}
          data-esc-clears
          aria-invalid={!!error}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
            if (e.key === 'Escape' && text) {
              // Töm fältet först; ett Esc till stänger rutan.
              e.stopPropagation()
              setText('')
              setError(null)
            }
          }}
          className={`h-8 ${inputWidth} rounded-full border border-dashed bg-transparent px-3 text-[13px] tabular-nums outline-none placeholder:text-faint focus:border-solid focus:border-accent focus:bg-field focus:ring-2 focus:ring-accent-soft narrow:h-9 ${error ? 'border-danger' : 'border-disabled'}`}
        />
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}

type ColorFields = Omit<CatalogColor, 'id' | 'updatedAt'>

export function Colors() {
  const catalog = useCatalogStore((s) => s.catalog)
  const addColor = useCatalogStore((s) => s.addColor)
  const setHidden = useCatalogStore((s) => s.setHidden)
  // En ny färg är ett utkast tills man trycker Lägg till.
  const [draft, setDraft] = useState<ColorFields | null>(null)
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className={groupTitle}>Egna färger</h3>
        <p className="text-[13px] text-muted">
          Kulörerna du brukar måla med, t.ex. en NCS-kod från färgburken. De syns under Färg på en del, i alla modeller.
        </p>
        {catalog.colors.map((c) => (
          <SavedColorRow key={c.id} color={c} />
        ))}
        {draft ? (
          <div className="flex flex-col gap-2 rounded-lg bg-field p-2.5">
            <ColorFieldsRow draft value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
            <div className="flex justify-end gap-2">
              <button className={secondaryButton} onClick={() => setDraft(null)}>
                Avbryt
              </button>
              <button
                className={primaryButton}
                onClick={() => {
                  // Utan namn får färgen heta som sin kod.
                  addColor({ ...draft, name: draft.name.trim() || draft.code || 'Egen färg' })
                  setDraft(null)
                }}
              >
                Lägg till
              </button>
            </div>
          </div>
        ) : (
          <button className={`${secondaryButton} self-start`} onClick={() => setDraft({ name: '', color: '#f1efe9' })}>
            <Plus {...ICON_SM} />
            Ny färg
          </button>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <AllHeader title="Inbyggda färger" ids={BUILT_IN_COLORS.map((c) => c.id)} />
        <p className="mb-1 text-[13px] text-muted">
          Vanliga kulörer på montrar och väggar. Färgen på skärmen är ungefärlig; det är koden som gäller.
        </p>
        <ShownList>
          {BUILT_IN_COLORS.map((c) => (
            <ShownRow
              key={c.id}
              round
              color={c.color}
              name={c.name}
              note={c.code}
              shown={!catalog.hidden.includes(c.id)}
              onChange={(on) => setHidden(c.id, !on)}
            />
          ))}
        </ShownList>
      </section>
    </div>
  )
}

/** Färgruta, namn och kod för en färg. */
function ColorFieldsRow({
  value: c,
  onChange,
  draft = false,
}: {
  value: ColorFields
  onChange: (patch: Partial<ColorFields>) => void
  /** En ny färg: namnet får vara tomt tills den läggs till. */
  draft?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <ColorInput label={`Färg för ${c.name}`} value={c.color} onCommit={(color) => onChange({ color })} />
      <div className="min-w-0 flex-1">
        <CommitField
          label="Namn"
          placeholder="Namn"
          value={c.name}
          onCommit={(t) => {
            if (!t.trim() && !draft) return 'Namnet får inte vara tomt'
            onChange({ name: t.trim() })
            return null
          }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <CommitField
          label="Färgkod"
          placeholder="Kod"
          value={c.code ?? ''}
          onCommit={(t) => {
            onChange({ code: t.trim() || undefined })
            return null
          }}
        />
      </div>
    </div>
  )
}

function SavedColorRow({ color: c }: { color: CatalogColor }) {
  const update = useCatalogStore((s) => s.updateColor)
  const remove = useCatalogStore((s) => s.removeColor)
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <ColorFieldsRow value={c} onChange={(patch) => update(c.id, patch)} />
      </div>
      <Tip label="Ta bort färgen">
        <button
          className={`${iconAction} text-muted hover:bg-hover`}
          aria-label="Ta bort färgen"
          onClick={() => remove(c.id)}
        >
          <X {...ICON_SM} />
        </button>
      </Tip>
    </div>
  )
}
