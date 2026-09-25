import { ArrowUpFromLine, Copy, RotateCw, Trash2, Unlink } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { rectSize } from '../model/geometry'
import { AXES, extent, widthAxis } from '../model/partAxes'
import { anglesOf, restOf } from '../model/orientation'
import { minCorner, WORLD_AXES } from '../model/placement'
import { instanceCounts, resolveBodies } from '../model/resolve'
import { MATERIALS, type Axis, type Body, type Instance, type PartDef } from '../model/types'
import { AXIS_COLORS } from '../scene/colors'
import { useDocumentStore } from '../store/documentStore'
import { beginPushPull } from '../tools/actions'
import { ExprInput } from './ExprInput'
import { Group } from './Group'
import { dangerButton, field, fieldLabel, primaryButton, secondaryButton, sectionTitle } from './ui'
import { useDraft } from './useDraft'
import { Tip } from './Tip'
import { numberFormat } from '../model/numberFormat'

const fmt = numberFormat(1)

/** Fält som sparar vid Enter eller när fokus lämnar, så att varje tangent inte blir ett ångra-steg. */
function CommitField({
  value,
  onCommit,
  className = field,
  inputMode,
  prefix,
  suffix,
  label,
  expr = false,
}: {
  value: string
  /** Returnerar felmeddelande, eller null om värdet sparades. */
  onCommit: (text: string) => string | null
  className?: string
  inputMode?: 'text' | 'decimal'
  /** Visas inne i fältet före värdet, t.ex. axelns bokstav. */
  prefix?: ReactNode
  /** Enheten inne i fältet, t.ex. mm. */
  suffix?: string
  /** Namn för skärmläsare när fältet saknar synlig etikett. */
  label?: string
  /** Fältet tar uttryck: föreslå parametrar och visa dem som badges. */
  expr?: boolean
}) {
  const [text, setText] = useDraft(value)
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    if (text === value) return setError(null)
    const e = onCommit(text)
    setError(e)
  }
  const boxed = !!(prefix || suffix)
  const inputClass = boxed
    ? 'min-w-0 flex-1 bg-transparent text-ink tabular-nums outline-none'
    : `${className} ${error ? 'border-danger' : ''}`
  const common = {
    'aria-label': label,
    'aria-invalid': !!error,
    inputMode,
    onBlur: save,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur()
      if (e.key === 'Escape') {
        setText(value)
        setError(null)
      }
    },
  }
  const input = expr ? (
    <ExprInput
      {...common}
      value={text}
      onChange={setText}
      badges
      className={inputClass}
      // Utan ram räknas kanten (1 px) med i fältets utfyllnad.
      padX={boxed ? 'px-0' : 'px-[11px]'}
      wrapperClass={boxed ? 'block min-w-0 flex-1' : 'block w-full'}
    />
  ) : (
    <input {...common} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
  )
  return (
    <>
      {prefix || suffix ? (
        <span
          className={`flex h-10 items-center gap-1.5 rounded-lg border bg-field px-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft narrow:h-11 ${error ? 'border-danger' : 'border-line'}`}
        >
          {prefix}
          {input}
          {suffix && <span className="text-[13px] text-unit">{suffix}</span>}
        </span>
      ) : (
        input
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </>
  )
}

/** Axelns bokstav i samma färg som axelkorset och flyttpilarna. */
function AxisTag({ index }: { index: 0 | 1 | 2 }) {
  return (
    <span aria-hidden className="text-xs font-bold" style={{ color: AXIS_COLORS[index] }}>
      {'XYZ'[index]}
    </span>
  )
}

/** Beräknat värde under ett fält som innehåller ett uttryck. */
const Computed = ({ value }: { value: number }) => <span className="text-xs text-accent">= {fmt.format(value)}</span>

/**
 * Längd, bredd och tjocklek enligt snickarkonventionen: L längs fibern, T tjockleken,
 * B det som blir över. Varje fält hör till en axel, så etiketterna ligger fast
 * när måtten ändras; de byter bara när man vrider fibern eller väljer annan tjocklek.
 */
function ExtentFields({ body, def }: { body: Body; def: PartDef }) {
  const setExtent = useDocumentStore((s) => s.setExtent)
  const fields: [string, Axis][] = [
    ['Längd', def.grainAxis],
    ['Bredd', widthAxis(def)],
    ['Tjocklek', def.thicknessAxis],
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {fields.map(([label, axis]) => {
        const expr = def.dims?.[axis]?.expr
        const size = extent(body, axis)
        return (
          <label key={label} className={fieldLabel}>
            {label}
            <CommitField
              key={`${body.id}:${axis}`}
              expr
              value={expr ?? fmt.format(size)}
              onCommit={(t) => setExtent(body.id, axis, t)}
            />
            {expr && <Computed value={size} />}
          </label>
        )
      })}
    </div>
  )
}

/**
 * Läget för delens hörn närmast origo, per världsaxel (som axelkorset).
 * Ett uttryck med parametrar sparas och följer parametern; ett tal flyttar bara delen.
 */
function PositionFields({ inst, def }: { inst: Instance; def: PartDef }) {
  const setPosition = useDocumentStore((s) => s.setPosition)
  const corner = minCorner(inst, def)
  return (
    <div className="grid grid-cols-3 gap-2">
      {WORLD_AXES.map((axis, i) => {
        const expr = inst.pos?.[axis]
        return (
          <div key={axis} className="flex min-w-0 flex-col gap-1">
            <CommitField
              key={`${inst.id}:${axis}`}
              label={`Placering ${axis.toUpperCase()}`}
              prefix={<AxisTag index={i as 0 | 1 | 2} />}
              expr
              value={expr ?? fmt.format(corner[i]!)}
              onCommit={(t) => setPosition(inst.id, axis, t)}
            />
            {expr && <Computed value={corner[i]!} />}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Vinklar runt världens X, Y och Z i grader, räknat från hur delen låg innan
 * den vreds första gången. Delen vrids runt sin mitt. Uttryck beräknas men sparas inte.
 */
function AngleFields({ inst }: { inst: Instance }) {
  const setAngle = useDocumentStore((s) => s.setAngle)
  const angles = anglesOf(inst.frame, restOf(inst))
  return (
    <div className="grid grid-cols-3 gap-2">
      {WORLD_AXES.map((axis, i) => (
        <CommitField
          key={`${inst.id}:${axis}`}
          label={`Vinkel runt ${axis.toUpperCase()}`}
          prefix={<AxisTag index={i as 0 | 1 | 2} />}
          suffix="°"
          expr
          value={fmt.format(angles[i]!)}
          onCommit={(t) => setAngle(inst.id, axis, t)}
        />
      ))}
    </div>
  )
}

/** Vrid fibern (byt L och B) och välj vilket mått som är tjockleken. */
function GrainControls({ body, def }: { body: Body; def: PartDef }) {
  const updatePart = useDocumentStore((s) => s.updatePart)
  const setThickness = (axis: Axis) => {
    // Fibern stannar om den kan; annars läggs den längs det längsta av de två andra.
    const rest = AXES.filter((a) => a !== axis)
    const grainAxis = rest.includes(def.grainAxis)
      ? def.grainAxis
      : [...rest].sort((a, b) => extent(body, b) - extent(body, a))[0]!
    updatePart(body.id, { thicknessAxis: axis, grainAxis })
  }
  return (
    <div className="grid grid-cols-2 items-end gap-2">
      <label className={fieldLabel}>
        Tjockleken är
        <select className={field} value={def.thicknessAxis} onChange={(e) => setThickness(e.target.value as Axis)}>
          {AXES.map((a) => (
            <option key={a} value={a}>
              {fmt.format(extent(body, a))} mm-måttet
            </option>
          ))}
        </select>
      </label>
      <Tip label="Byt längd och bredd: fibern går längs det andra måttet">
        <button className={secondaryButton} onClick={() => updatePart(body.id, { grainAxis: widthAxis(def) })}>
          <RotateCw size={16} strokeWidth={1.75} aria-hidden />
          Vrid fibern 90°
        </button>
      </Tip>
    </div>
  )
}

const ICON_SM = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

export function Properties() {
  const selection = useDocumentStore((s) => s.selection)
  const doc = useDocumentStore((s) => s.doc)
  const updatePart = useDocumentStore((s) => s.updatePart)
  const deleteSelection = useDocumentStore((s) => s.deleteSelection)
  const duplicateLinked = useDocumentStore((s) => s.duplicateLinked)
  const makeUnique = useDocumentStore((s) => s.makeUnique)
  const clearDocument = useDocumentStore((s) => s.clearDocument)

  const body = selection?.kind === 'body' ? resolveBodies(doc).find((b) => b.id === selection.id) : undefined
  const def = body && doc.defs.find((d) => d.id === body.defId)
  const inst = body && doc.instances.find((i) => i.id === body.id)
  const copies = def ? (instanceCounts(doc).get(def.id) ?? 0) : 0
  const sketch = selection?.kind === 'sketch' ? doc.sketches.find((s) => s.id === selection.id) : undefined
  const isEmpty = doc.instances.length === 0 && doc.sketches.length === 0 && doc.params.length === 0

  return (
    <section className="group-data-[tab=cutlist]/sheet:hidden group-data-[tab=params]/sheet:hidden">
      <h2 className={sectionTitle}>Egenskaper</h2>
      {body && def ? (
        <div className="flex flex-col gap-4">
          <Group title="Del">
            <CommitField
              key={def.id}
              label="Namn"
              className={`${field} text-base font-semibold`}
              value={def.name}
              onCommit={(t) => {
                if (!t.trim()) return 'Namnet får inte vara tomt'
                updatePart(body.id, { name: t.trim() })
                return null
              }}
            />
            <label className={fieldLabel}>
              Material
              <select
                className={field}
                value={def.material}
                onChange={(e) => updatePart(body.id, { material: e.target.value })}
              >
                {MATERIALS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </Group>

          <Group title="Mått" note="mm · L går längs fibern">
            <ExtentFields body={body} def={def} />
            <GrainControls body={body} def={def} />
            <p className="text-xs text-faint">
              Skriv ett parameternamn, t.ex. <code>tjocklek</code>, så följer måttet parametern.
            </p>
          </Group>

          {inst && (
            <>
              <Group title="Placering" note="mm · hörnet närmast origo">
                <PositionFields inst={inst} def={def} />
              </Group>
              <Group title="Vinkel" note="runt delens mitt">
                <AngleFields inst={inst} />
              </Group>
            </>
          )}

          <Group title="Kopior" note={copies > 1 && <span className="text-accent">{copies} länkade</span>}>
            {copies > 1 && <p className="text-[13px] text-muted">De delar form: ändrar du måtten här ändras alla.</p>}
            <div className="grid grid-cols-2 gap-2">
              <button className={secondaryButton} onClick={() => duplicateLinked(body.id)}>
                <Copy {...ICON_SM} />
                Länkad kopia
              </button>
              {copies > 1 && (
                <Tip label="Ge den här kopian en egen form">
                  <button className={secondaryButton} onClick={() => makeUnique(body.id)}>
                    <Unlink {...ICON_SM} />
                    Gör unik
                  </button>
                </Tip>
              )}
            </div>
          </Group>

          <button className={`${dangerButton} w-full`} onClick={deleteSelection}>
            <Trash2 {...ICON_SM} />
            Ta bort del
          </button>
        </div>
      ) : sketch ? (
        <div className="flex flex-col gap-4">
          <Group title="Skiss">
            <p className="text-base font-semibold tabular-nums">
              {(([w, h]) => `${fmt.format(w)} × ${fmt.format(h)} mm`)(rectSize(sketch.rect))}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button className={primaryButton} onClick={() => beginPushPull({ kind: 'sketch', id: sketch.id })}>
                <ArrowUpFromLine {...ICON_SM} />
                Dra ut till en del
              </button>
              <button className={dangerButton} onClick={deleteSelection}>
                <Trash2 {...ICON_SM} />
                Ta bort skiss
              </button>
            </div>
          </Group>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-faint">Inget valt. Tryck på en del eller skiss med verktyget Välj.</p>
          {!isEmpty && (
            <button className={dangerButton} onClick={clearDocument}>
              <Trash2 {...ICON_SM} />
              Rensa modellen
            </button>
          )}
        </div>
      )}
    </section>
  )
}
