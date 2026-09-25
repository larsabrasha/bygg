import { useState } from 'react'
import { bodyDims, rectSize } from '../model/geometry'
import { MATERIALS, type Body, type Grain } from '../model/types'
import { useDocumentStore } from '../store/documentStore'
import { dangerButton, field, fieldLabel, sectionTitle } from './ui'

const fmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 })

/** Namnfältet sparar vid Enter eller när fokus lämnar, så att varje tangent inte blir ett ångra-steg. */
function NameField({ body }: { body: Body }) {
  const updateBody = useDocumentStore((s) => s.updateBody)
  const [name, setName] = useState(body.name)
  const save = () => {
    const trimmed = name.trim()
    if (trimmed) updateBody(body.id, { name: trimmed })
    else setName(body.name)
  }
  return (
    <input
      className={field}
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

export function Properties() {
  const selection = useDocumentStore((s) => s.selection)
  const doc = useDocumentStore((s) => s.doc)
  const updateBody = useDocumentStore((s) => s.updateBody)
  const deleteSelection = useDocumentStore((s) => s.deleteSelection)

  const body = selection?.kind === 'body' ? doc.bodies.find((b) => b.id === selection.id) : undefined
  const sketch = selection?.kind === 'sketch' ? doc.sketches.find((s) => s.id === selection.id) : undefined

  return (
    <section className="narrow:group-data-[tab=cutlist]/sheet:hidden">
      <h2 className={sectionTitle}>Egenskaper</h2>
      {body ? (
        <div className="grid grid-cols-2 gap-2">
          <label className={`${fieldLabel} col-span-2`}>
            Namn
            {/* key: nollställ fältet när man byter del eller ångrar ett namnbyte. */}
            <NameField key={`${body.id}:${body.name}`} body={body} />
          </label>
          <label className={fieldLabel}>
            Material
            <select className={field} value={body.material} onChange={(e) => updateBody(body.id, { material: e.target.value })}>
              {MATERIALS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabel}>
            Fiberriktning
            <select className={field} value={body.grain} onChange={(e) => updateBody(body.id, { grain: e.target.value as Grain })}>
              <option value="length">Längs längden</option>
              <option value="width">Längs bredden</option>
            </select>
          </label>
          <p className="col-span-2 tabular-nums">
            {(({ length, width, thickness }) => `${fmt.format(length)} × ${fmt.format(width)} × ${fmt.format(thickness)} mm`)(
              bodyDims(body),
            )}
          </p>
          <button className={`${dangerButton} col-span-2`} onClick={deleteSelection}>
            Ta bort del
          </button>
        </div>
      ) : sketch ? (
        <div className="grid grid-cols-2 gap-2">
          <p className="col-span-2 tabular-nums">
            Skiss {(([w, h]) => `${fmt.format(w)} × ${fmt.format(h)} mm`)(rectSize(sketch.rect))}
          </p>
          <p className="col-span-2 text-faint">Välj Push/pull och tryck på skissen för att göra en del av den.</p>
          <button className={`${dangerButton} col-span-2`} onClick={deleteSelection}>
            Ta bort skiss
          </button>
        </div>
      ) : (
        <p className="text-faint">Inget valt. Välj en del med verktyget Välj.</p>
      )}
    </section>
  )
}
