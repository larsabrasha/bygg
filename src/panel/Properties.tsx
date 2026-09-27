import { useMemo } from 'react'
import { ArrowUpFromLine, Copy, RotateCw, Trash2, Unlink } from 'lucide-react'
import { rectSize } from '../model/geometry'
import { AXES, extent, widthAxis } from '../model/partAxes'
import { anglesOf, restOf } from '../model/orientation'
import { minCorner, WORLD_AXES } from '../model/placement'
import { instanceCounts, resolveBodies } from '../model/resolve'
import { pickerMaterials } from '../model/catalog'
import { firstUpper, MATERIAL_GROUPS, materialSpec, materialTitle } from '../model/materials'
import type { Axis, Body, Instance, PartDef } from '../model/types'
import { AXIS_COLORS } from '../scene/colors'
import { useCatalogStore } from '../store/catalogStore'
import { useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { beginPushPull } from '../tools/actions'
import { CommitField } from './CommitField'
import { Group } from './Group'
import { dangerButton, field, fieldLabel, primaryButton, secondaryButton, sectionTitle } from './ui'
import { NothingSelected } from './NothingSelected'
import { PaintField } from './PaintField'
import { Tip } from './Tip'
import { numberFormat } from '../model/numberFormat'

const fmt = numberFormat(1)

/** Sista raden i materialväljaren: öppnar Material och färger i stället för att välja. */
const EDIT_MATERIALS = '\u0000ändra'

/** Axelns bokstav i samma färg som axelkorset och flyttpilarna. */
function AxisTag({ index }: { index: 0 | 1 | 2 }) {
  return (
    <span aria-hidden className="text-xs font-bold" style={{ color: AXIS_COLORS[index] }}>
      {'XYZ'[index]}
    </span>
  )
}

/**
 * Ett mått som styrs av ett uttryck: fältet visar det beräknade talet (uttrycket ryms inte
 * i ett smalt fält), i accentfärg, och uttrycket står under. Med fokus står uttrycket i fältet.
 */
const Computed = ({ value }: { value: number }) => <span className="text-accent tabular-nums">{fmt.format(value)}</span>
const Formula = ({ expr }: { expr: string }) => (
  <span className="truncate px-2.5 text-xs text-accent" title={expr}>
    = {expr}
  </span>
)

/**
 * Längd, bredd och tjocklek enligt snickarkonventionen: L längs fibern, T tjockleken,
 * B det som blir över. Varje fält hör till en axel, så etiketterna ligger fast
 * när måtten ändras; de byter bara när man vrider fibern eller väljer annan tjocklek.
 */
function ExtentFields({ body, def }: { body: Body; def: PartDef }) {
  const setExtent = useDocumentStore((s) => s.setExtent)
  const name = (axis: Axis) => (axis === def.grainAxis ? 'Längd' : axis === def.thicknessAxis ? 'Tjocklek' : 'Bredd')
  // En cylinder har två mått: diametern (u och v är samma) och måttet längs den.
  const fields: [string, string, Axis][] =
    def.shape === 'circle'
      ? [
          ['Diameter', 'Ø', 'u'],
          [name('n'), name('n')[0]!, 'n'],
        ]
      : [
          ['Längd', 'L', def.grainAxis],
          ['Bredd', 'B', widthAxis(def)],
          ['Tjocklek', 'T', def.thicknessAxis],
        ]
  return (
    <div className={`grid gap-2 ${fields.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {fields.map(([label, letter, axis]) => {
        const expr = def.dims?.[axis]?.expr
        const size = extent(body, axis)
        return (
          <div key={label} className="flex min-w-0 flex-col gap-1">
            <CommitField
              key={`${body.id}:${axis}`}
              label={label}
              prefix={<Letter>{letter}</Letter>}
              quiet
              expr
              value={expr ?? fmt.format(size)}
              display={expr ? <Computed value={size} /> : undefined}
              onCommit={(t) => setExtent(body.id, axis, t)}
            />
            {expr && <Formula expr={expr} />}
          </div>
        )
      })}
    </div>
  )
}

/** L, B eller T före måttet, som etiketterna i 3D-vyn. */
const Letter = ({ children }: { children: string }) => (
  <span aria-hidden className="text-xs font-bold text-muted">
    {children}
  </span>
)

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
              quiet
              expr
              value={expr ?? fmt.format(corner[i]!)}
              display={expr ? <Computed value={corner[i]!} /> : undefined}
              onCommit={(t) => setPosition(inst.id, axis, t)}
            />
            {expr && <Formula expr={expr} />}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Vinklar runt världens X, Y och Z i grader, räknat från hur delen låg innan
 * den vreds första gången. Delen vrids runt sin mitt. Uttryck beräknas men sparas inte.
 * Enheten står i gruppens rubrik, som mm för måtten: i ett tyst fält hamnar den långt från talet.
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
          quiet
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
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-xs text-muted">
        Tjockleken är
        <select
          className={`${field} w-auto!`}
          value={def.thicknessAxis}
          onChange={(e) => setThickness(e.target.value as Axis)}
        >
          {AXES.map((a) => (
            <option key={a} value={a}>
              {fmt.format(extent(body, a))} mm-måttet
            </option>
          ))}
        </select>
      </label>
      {/* MDF, glas och annat utan fiber: L är bara det längsta måttet, inget att vrida. */}
      {materialSpec(def.material).grain && (
        <Tip label="Byt längd och bredd: fibern går längs det andra måttet">
          <button className={secondaryButton} onClick={() => updatePart(body.id, { grainAxis: widthAxis(def) })}>
            <RotateCw size={16} strokeWidth={1.75} aria-hidden />
            Vrid fibern 90°
          </button>
        </Tip>
      )}
    </div>
  )
}

const ICON_SM = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

/**
 * Verktyg: vilken del det läggs till på eller skärs ut ur, och Lossa.
 * Värd: dess verktyg (tryck för att välja ett), och att det gäller alla länkade kopior.
 */
function CombineGroup({ body }: { body: Body }) {
  const doc = useDocumentStore((s) => s.doc)
  const select = useDocumentStore((s) => s.select)
  const detach = useDocumentStore((s) => s.detach)
  const bodies = resolveBodies(doc)
  const link = (id: string) => (
    <button className="cursor-pointer font-semibold text-accent" onClick={() => select({ kind: 'body', id })}>
      {bodies.find((b) => b.id === id)?.name}
    </button>
  )
  if (body.tool) {
    const { op, host, into } = body.tool
    return (
      <Group title={{ subtract: 'Skärs ut', add: 'Läggs till', joint: 'Tapp' }[op]}>
        <p className="text-[13px] text-muted">
          {op === 'joint' && into ? (
            <>
              Tapp på {link(host)}, med tapphål i {link(into)}. Tapphålet har samma form som tappen, så de passar alltid
              ihop. Tappen finns på alla länkade kopior av {link(host)}, men tapphålet bara i den här {link(into)}, inte
              i dess länkade kopior.
            </>
          ) : (
            <>
              {op === 'subtract' ? 'Skärs ut ur' : 'Läggs till på'} {link(host)}. Det gäller alla länkade kopior.
            </>
          )}{' '}
          Flytta eller ändra den här delen så följer resultatet med.
        </p>
        <button className={secondaryButton} onClick={() => detach(body.id)}>
          <Unlink {...ICON_SM} />
          Lossa
        </button>
      </Group>
    )
  }
  // Verktyg på delen, och tappar från andra delar som går in i den (tapphål).
  const tools = bodies.filter((b) => b.tool?.host === body.id || b.tool?.into === body.id)
  if (tools.length === 0) return null
  const label = (t: Body) =>
    t.tool!.op === 'joint'
      ? t.tool!.into === body.id
        ? 'tapphål'
        : 'tapp'
      : t.tool!.op === 'subtract'
        ? 'skärs ut'
        : 'läggs till'
  return (
    <Group title="Urskärningar och tillägg">
      <ul className="flex flex-col">
        {tools.map((t) => (
          <li key={t.id}>
            <button
              className="flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 text-left text-[13px] hover:bg-hover narrow:h-11"
              onClick={() => select({ kind: 'body', id: t.id })}
            >
              <span className="font-semibold">{t.name}</span>
              <span className="text-muted">{label(t)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Group>
  )
}

export function Properties() {
  const selection = useDocumentStore((s) => s.selection)
  const doc = useDocumentStore((s) => s.doc)
  const updatePart = useDocumentStore((s) => s.updatePart)
  const deleteSelection = useDocumentStore((s) => s.deleteSelection)
  const duplicateLinked = useDocumentStore((s) => s.duplicateLinked)
  const makeUnique = useDocumentStore((s) => s.makeUnique)
  const catalog = useCatalogStore((s) => s.catalog)
  const choices = useMemo(() => pickerMaterials(catalog), [catalog])

  const body = selection?.kind === 'body' ? resolveBodies(doc).find((b) => b.id === selection.id) : undefined
  const def = body && doc.defs.find((d) => d.id === body.defId)
  const inst = body && doc.instances.find((i) => i.id === body.id)
  const copies = def ? (instanceCounts(doc).get(def.id) ?? 0) : 0
  const sketch = selection?.kind === 'sketch' ? doc.sketches.find((s) => s.id === selection.id) : undefined
  const isEmpty = doc.instances.length === 0 && doc.sketches.length === 0 && doc.params.length === 0

  return (
    <section className="flex flex-1 flex-col group-data-[tab=cutlist]/sheet:hidden group-data-[tab=params]/sheet:hidden">
      <h2 className={sectionTitle}>Egenskaper</h2>
      {body && def ? (
        <div className="flex flex-col gap-4">
          <Group title="Del">
            {/* Samma ord som i kaplistan och på ritningen. */}
            <label className={fieldLabel}>
              Namn
              <CommitField
                key={def.id}
                className={`${field} text-base font-semibold`}
                value={def.name}
                onCommit={(t) => {
                  if (!t.trim()) return 'Namnet får inte vara tomt'
                  updatePart(body.id, { name: t.trim() })
                  return null
                }}
              />
            </label>
            <label className={fieldLabel}>
              Material
              <select
                className={field}
                value={def.material}
                onChange={(e) => {
                  if (e.target.value === EDIT_MATERIALS) useLibraryStore.getState().set({ catalogOpen: 'materials' })
                  else updatePart(body.id, { material: e.target.value })
                }}
              >
                {MATERIAL_GROUPS.map((g) => {
                  const list = choices.filter((m) => m.kind === g.kind)
                  return (
                    list.length > 0 && (
                      <optgroup key={g.kind} label={g.title}>
                        {list.map((m) => (
                          <option key={m.id} value={m.id}>
                            {firstUpper(m.name)}
                          </option>
                        ))}
                      </optgroup>
                    )
                  )
                })}
                {/* Ett dolt, borttaget eller okänt material står kvar för den del som har det. */}
                {!choices.some((m) => m.id === def.material) && (
                  <option value={def.material}>{materialTitle(def.material)}</option>
                )}
                <option value={EDIT_MATERIALS}>Redigera materiallistan…</option>
              </select>
            </label>
            <PaintField instanceId={body.id} def={def} />
          </Group>

          {/* Utan fiber (MDF, glas) följer fälten delens axlar; kaplistan tar det längsta som L. */}
          <Group title="Mått" note={materialSpec(def.material).grain ? 'mm · L går längs fibern' : 'mm'}>
            {/* Tipset om parametrar syns bara medan man ändrar ett mått. */}
            <div className="group/dims flex flex-col gap-1.5">
              <ExtentFields body={body} def={def} />
              <p className="hidden text-xs text-faint group-focus-within/dims:block">
                Skriv ett parameternamn, t.ex. <code>tjocklek</code>, så följer måttet parametern.
              </p>
            </div>
            <GrainControls body={body} def={def} />
          </Group>

          {inst && (
            <>
              <Group title="Placering" note="mm · hörnet närmast origo">
                <PositionFields inst={inst} def={def} />
              </Group>
              <Group title="Vinkel" note="grader · runt delens mitt">
                <AngleFields inst={inst} />
              </Group>
            </>
          )}

          <CombineGroup body={body} />

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
              {(([w, h]) =>
                sketch.shape === 'circle' ? `Ø ${fmt.format(w)} mm` : `${fmt.format(w)} × ${fmt.format(h)} mm`)(
                rectSize(sketch.rect),
              )}
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
        <NothingSelected isEmpty={isEmpty} />
      )}
    </section>
  )
}
