import { useState } from 'react'
import { rectSize } from '../model/geometry'
import { AXES, extent, widthAxis } from '../model/partAxes'
import { instanceCounts, resolveBodies } from '../model/resolve'
import { MATERIALS, type Axis, type Body, type PartDef } from '../model/types'
import { useDocumentStore } from '../store/documentStore'
import { beginPushPull } from '../tools/actions'
import { dangerButton, field, fieldLabel, primaryButton, secondaryButton, sectionTitle } from './ui'
import { useDraft } from './useDraft'

const fmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1, useGrouping: false })

/** Fält som sparar vid Enter eller när fokus lämnar, så att varje tangent inte blir ett ångra-steg. */
function CommitField({
  value,
  onCommit,
  className = field,
  inputMode,
}: {
  value: string
  /** Returnerar felmeddelande, eller null om värdet sparades. */
  onCommit: (text: string) => string | null
  className?: string
  inputMode?: 'text' | 'decimal'
}) {
  const [text, setText] = useDraft(value)
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    if (text === value) return setError(null)
    const e = onCommit(text)
    setError(e)
  }
  return (
    <>
      <input
        className={`${className} ${error ? 'border-danger' : ''}`}
        value={text}
        inputMode={inputMode}
        aria-invalid={!!error}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setText(value)
            setError(null)
          }
        }}
      />
      {error && <span className="text-danger">{error}</span>}
    </>
  )
}

/**
 * Längd, bredd och tjocklek enligt snickarkonventionen: L längs fibern, T tjockleken,
 * B det som blir över. Varje fält hör till en axel, så etiketterna ligger fast
 * när måtten ändras; de byter bara när man vrider fibern eller väljer annan tjocklek.
 */
function ExtentFields({ body, def }: { body: Body; def: PartDef }) {
  const setExtent = useDocumentStore((s) => s.setExtent)
  const fields: [string, Axis][] = [
    ['Längd (L)', def.grainAxis],
    ['Bredd (B)', widthAxis(def)],
    ['Tjocklek (T)', def.thicknessAxis],
  ]
  return (
    <>
      {fields.map(([label, axis]) => {
        const expr = def.dims?.[axis]?.expr
        const size = extent(body, axis)
        const value = expr ?? fmt.format(size)
        return (
          <label key={label} className={fieldLabel}>
            <span>
              {label} {expr && <span className="text-accent">= {fmt.format(size)}</span>}
            </span>
            <CommitField key={`${body.id}:${axis}`} value={value} onCommit={(t) => setExtent(body.id, axis, t)} />
          </label>
        )
      })}
    </>
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
    <>
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
      <div className={fieldLabel}>
        Fiberriktning
        <button
          className={secondaryButton}
          title="Byt längd och bredd: fibern går längs det andra måttet"
          onClick={() => updatePart(body.id, { grainAxis: widthAxis(def) })}
        >
          Vrid fibern 90°
        </button>
      </div>
    </>
  )
}

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
  const copies = def ? (instanceCounts(doc).get(def.id) ?? 0) : 0
  const sketch = selection?.kind === 'sketch' ? doc.sketches.find((s) => s.id === selection.id) : undefined
  const isEmpty = doc.instances.length === 0 && doc.sketches.length === 0 && doc.params.length === 0

  return (
    <section className="narrow:group-data-[tab=cutlist]/sheet:hidden narrow:group-data-[tab=params]/sheet:hidden">
      <h2 className={sectionTitle}>Egenskaper</h2>
      {body && def ? (
        <div className="grid grid-cols-2 gap-2">
          <label className={`${fieldLabel} col-span-2`}>
            Namn
            <CommitField
              key={def.id}
              value={def.name}
              onCommit={(t) => {
                if (!t.trim()) return 'Namnet får inte vara tomt'
                updatePart(body.id, { name: t.trim() })
                return null
              }}
            />
          </label>
          <label className={`${fieldLabel} col-span-2`}>
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
          <ExtentFields body={body} def={def} />
          <span />
          <GrainControls body={body} def={def} />
          <p className="col-span-2 text-xs text-faint">
            Mått i mm. L går längs fibern. Skriv ett parameternamn, t.ex. <code>tjocklek</code>, så följer måttet
            parametern.
          </p>
          {copies > 1 && <p className="col-span-2 text-accent">{copies} länkade kopior – ändringar gäller alla.</p>}
          <button className={secondaryButton} onClick={() => duplicateLinked(body.id)}>
            Länkad kopia
          </button>
          {copies > 1 ? (
            <button className={secondaryButton} onClick={() => makeUnique(body.id)}>
              Gör unik
            </button>
          ) : (
            <span />
          )}
          <button className={`${dangerButton} col-span-2`} onClick={deleteSelection}>
            Ta bort del
          </button>
        </div>
      ) : sketch ? (
        <div className="grid grid-cols-2 gap-2">
          <p className="col-span-2 tabular-nums">
            Skiss {(([w, h]) => `${fmt.format(w)} × ${fmt.format(h)} mm`)(rectSize(sketch.rect))}
          </p>
          <button className={primaryButton} onClick={() => beginPushPull({ kind: 'sketch', id: sketch.id })}>
            Dra ut till en del
          </button>
          <button className={dangerButton} onClick={deleteSelection}>
            Ta bort skiss
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-faint">Inget valt. Tryck på en del eller skiss med verktyget Välj.</p>
          {!isEmpty && (
            <button className={`${dangerButton} self-start`} onClick={clearDocument}>
              Rensa modellen
            </button>
          )}
        </div>
      )}
    </section>
  )
}
