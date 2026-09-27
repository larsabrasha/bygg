import { ChevronDown, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { useLibraryStore } from '../store/libraryStore'
import { ColorInput } from './ColorInput'
import { CommitField } from './CommitField'
import { Switch } from './Switch'
import { Tip } from './Tip'
import {
  field,
  fieldLabel,
  groupTitle,
  iconAction,
  primaryButton,
  quietDangerButton,
  secondaryButton,
  segment,
  segmentGroup,
} from './ui'

const num = numberFormat(1)
const ICON_SM = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

/** Slagen som de heter i listrutan och på materialets rad. Korta, så att listan inte radbryts på iOS. */
const KIND_LABEL: Record<MaterialKind, string> = {
  wood: 'Massivt trä',
  sheet: 'Skiva',
  ordered: 'Beställs tillskuret',
}

/** Under listrutan: vad slaget betyder för kaplistan och kapschemat (se model/cutPlan). */
const KIND_HINT: Record<MaterialKind, string> = {
  wood: 'Kapschemat räknar på brädor och limfogsskivor i standardmått. Har alltid fiber.',
  sheet: 'Kapschemat lägger ut delarna på hela skivor i måtten nedan.',
  ordered: 'Står i kaplistan med måtten att beställa, men inte i kapschemat. Till exempel glas eller sten.',
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

/**
 * Material och färger: användarens egna material, de inbyggda som ska synas
 * i väljaren och standardfärgerna. Hör till användaren och gäller alla modeller.
 * Ett blad ovanpå allt, som ritningen; på smal skärm hela skärmen.
 */
export function CatalogSheet() {
  const open = useLibraryStore((s) => s.catalogOpen)
  const close = () => useLibraryStore.getState().set({ catalogOpen: null })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden narrow:items-stretch"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Material och färger"
        className="flex h-[min(88dvh,760px)] w-[min(560px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl narrow:h-dvh narrow:w-full narrow:rounded-none narrow:border-0"
      >
        <header className="flex items-center gap-2 border-b border-line px-4 py-2 pt-[max(8px,env(safe-area-inset-top))]">
          <h2 className="flex-1 text-base font-semibold">Material och färger</h2>
          <Tip label="Stäng">
            <button className={`${iconAction} hover:bg-hover`} aria-label="Stäng" onClick={close}>
              <X size={20} strokeWidth={1.75} aria-hidden />
            </button>
          </Tip>
        </header>
        <div className="px-4 pt-3">
          <div className={segmentGroup} role="group" aria-label="Visa">
            {(
              [
                ['materials', 'Material'],
                ['colors', 'Färger'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                className={segment}
                aria-pressed={open === v}
                onClick={() => useLibraryStore.getState().set({ catalogOpen: v })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          {open === 'materials' ? <Materials /> : <Colors />}
        </div>
      </div>
    </div>
  )
}

type MaterialFields = Omit<MaterialSpec, 'id'>

function Materials() {
  const catalog = useCatalogStore((s) => s.catalog)
  const addMaterial = useCatalogStore((s) => s.addMaterial)
  const setHidden = useCatalogStore((s) => s.setHidden)
  const [editing, setEditing] = useState<string | null>(null)
  // Ett nytt material är ett utkast tills man trycker Lägg till.
  const [draft, setDraft] = useState<MaterialFields | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className={groupTitle}>Egna material</h3>
        {catalog.materials.length === 0 && !draft && (
          <p className="text-[13px] text-muted">
            Lägg till det verkstaden har på lager, med tjocklekar och skivmått. Det syns i materialväljaren i alla
            modeller.
          </p>
        )}
        {catalog.materials.map((m) => (
          <MaterialRow
            key={m.id}
            material={m}
            open={editing === m.id}
            onToggle={() => setEditing(editing === m.id ? null : m.id)}
          />
        ))}
        {draft ? (
          <div className="flex flex-col gap-3 rounded-lg bg-field p-3">
            <h4 className="text-[13px] font-semibold">Nytt material</h4>
            <MaterialForm value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
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
          </div>
        ) : (
          <button
            className={`${secondaryButton} self-start`}
            onClick={() => {
              setDraft(NEW_MATERIAL)
              setEditing(null)
            }}
          >
            <Plus {...ICON_SM} />
            Nytt material
          </button>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <AllHeader title="Inbyggda material" ids={MATERIAL_SPECS.map((m) => m.id)} />
        <p className="mb-1 text-[13px] text-muted">
          Slå av dem du aldrig använder, så syns de inte i väljaren. Delar som redan har dem behåller dem.
        </p>
        {MATERIAL_GROUPS.map((g) => (
          <div key={g.kind} className="mt-2 flex flex-col">
            {/* Samma grupper och namn som i materialväljaren i Egenskaper. */}
            <h4 className="border-b border-line pb-1 text-xs font-semibold text-muted">{g.title}</h4>
            {MATERIAL_SPECS.filter((m) => m.kind === g.kind).map((m) => (
              <ShownRow
                key={m.id}
                color={m.color}
                name={firstUpper(m.name)}
                shown={!catalog.hidden.includes(m.id)}
                onChange={(on) => setHidden(m.id, !on)}
              />
            ))}
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

/** En inbyggd sak (material eller färg) med Visas: av betyder att den inte syns i väljaren. */
function ShownRow({
  color,
  name,
  note,
  shown,
  round,
  onChange,
}: {
  color: string
  name: string
  note?: string
  shown: boolean
  round?: boolean
  onChange: (shown: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line py-0.5 last:border-b-0">
      <Swatch color={color} round={round} />
      <span className="min-w-0 flex-1 text-[13px]">
        {name}
        {note && <span className="ml-2 text-xs text-muted">{note}</span>}
      </span>
      <Switch checked={shown} onChange={onChange}>
        Visas
      </Switch>
    </div>
  )
}

/** "Skiva · 12, 16, 19 mm · 2 440 × 1 220": det viktigaste om ett material på en rad. */
function summary(m: MaterialFields): string {
  const kind = KIND_LABEL[m.kind]
  const thick =
    m.kind !== 'wood' && m.thicknesses?.length ? `${m.thicknesses.map((t) => num.format(t)).join(', ')} mm` : ''
  const sheet =
    m.kind === 'sheet' && m.sheets?.[0] ? `${num.format(m.sheets[0].length)} × ${num.format(m.sheets[0].width)}` : ''
  return [kind, thick, sheet].filter(Boolean).join(' · ')
}

function MaterialRow({
  material: m,
  open,
  onToggle,
}: {
  material: CatalogMaterial
  open: boolean
  onToggle: () => void
}) {
  const update = useCatalogStore((s) => s.updateMaterial)
  const remove = useCatalogStore((s) => s.removeMaterial)
  return (
    <div className="rounded-lg bg-field">
      <button
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-left hover:bg-hover"
        aria-expanded={open}
        onClick={onToggle}
      >
        <Swatch color={m.color} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">{firstUpper(m.name)}</span>
          <span className="block text-xs text-muted tabular-nums">{summary(m)}</span>
        </span>
        <ChevronDown size={16} aria-hidden className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-3 pt-1 pb-3">
          <MaterialForm value={m} onChange={(patch) => update(m.id, patch)} />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-faint">Delar som har materialet behåller det, också om du tar bort det.</p>
            <button className={quietDangerButton} onClick={() => remove(m.id)}>
              <Trash2 {...ICON_SM} />
              Ta bort
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Fälten för ett material. Ett sparat ändras direkt; ett nytt är ett utkast (se Materials). */
function MaterialForm({
  value: m,
  onChange,
}: {
  value: MaterialFields
  onChange: (patch: Partial<MaterialFields>) => void
}) {
  const thicknessText = (m.thicknesses ?? []).map((t) => num.format(t)).join(', ')
  const sheetText = (m.sheets ?? []).map((s) => `${num.format(s.length)} × ${num.format(s.width)}`).join(', ')
  return (
    <>
      <label className={fieldLabel}>
        Namn
        <CommitField
          value={m.name}
          onCommit={(t) => {
            if (!t.trim()) return 'Namnet får inte vara tomt'
            onChange({ name: t.trim() })
            return null
          }}
        />
      </label>
      <label className={fieldLabel}>
        Slag
        <select
          className={field}
          value={m.kind}
          onChange={(e) => {
            const kind = e.target.value as MaterialKind
            // Massivt trä har alltid fiber och standardvirkets mått (se swedishStock).
            onChange(kind === 'wood' ? { kind, grain: true } : { kind })
          }}
        >
          {(Object.keys(KIND_LABEL) as MaterialKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <span className="text-faint">{KIND_HINT[m.kind]}</span>
      </label>
      {m.kind !== 'wood' && (
        <label className={fieldLabel}>
          Tjocklekar som finns, mm
          <CommitField
            value={thicknessText}
            placeholder="t.ex. 12, 16, 19"
            onCommit={(t) => {
              const thicknesses = parseThicknesses(t)
              if (t.trim() && thicknesses.length === 0) return 'Skriv tjocklekarna som tal, t.ex. 12, 16, 19'
              onChange({ thicknesses })
              return null
            }}
          />
        </label>
      )}
      {m.kind === 'sheet' && (
        <label className={fieldLabel}>
          Skivmått, mm (det vanligaste först)
          <CommitField
            value={sheetText}
            placeholder="t.ex. 2440 × 1220"
            onCommit={(t) => {
              const sheets = parseSheets(t)
              if (sheets.length === 0) return 'Skriv måttet som längd × bredd, t.ex. 2440 × 1220'
              onChange({ sheets })
              return null
            }}
          />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ColorInput label="Färg" value={m.color} onCommit={(color) => onChange({ color })} />
        <span className="text-xs text-muted">Färg i 3D-vyn och listorna</span>
        <span className="flex-1" />
        {m.kind !== 'wood' && (
          <Switch checked={m.grain} onChange={(grain) => onChange({ grain })}>
            Fiber
          </Switch>
        )}
        <Switch
          checked={m.opacity !== undefined}
          onChange={(on) => onChange({ opacity: on ? CLEAR_OPACITY : undefined })}
        >
          Genomskinligt
        </Switch>
      </div>
    </>
  )
}

type ColorFields = Omit<CatalogColor, 'id' | 'updatedAt'>

function Colors() {
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
