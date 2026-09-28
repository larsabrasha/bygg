import { useMemo } from 'react'
import { ArrowUpFromLine, Boxes, Copy, RotateCw, Trash2, Unlink } from 'lucide-react'
import { isMirrored } from '../model/frame'
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
import { beginPushPull, selectConnected } from '../tools/actions'
import { HostTools, ToolCard } from './CombineGroup'
import { CommitField } from './CommitField'
import { Group } from './Group'
import { dangerButton, field, fieldLabel, primaryButton, secondaryButton, sectionTitle } from './ui'
import { NothingSelected } from './NothingSelected'
import { PaintField } from './PaintField'
import { Tip } from './Tip'
import { numberFormat } from '../model/numberFormat'

const fmt = numberFormat(1)

/** Sista raden i materialväljaren: öppnar Material i Inställningar i stället för att välja. */
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

/** Materialväljaren, med materialen grupperade som i Inställningar. Sista raden öppnar materiallistan. */
function MaterialField({ value, onChange }: { value: string; onChange: (material: string) => void }) {
  const catalog = useCatalogStore((s) => s.catalog)
  const choices = useMemo(() => pickerMaterials(catalog), [catalog])
  return (
    <label className={fieldLabel}>
      Material
      <select
        className={field}
        value={value}
        onChange={(e) => {
          if (e.target.value === EDIT_MATERIALS) useLibraryStore.getState().set({ settings: 'materials' })
          else if (e.target.value !== MIXED) onChange(e.target.value)
        }}
      >
        {/* Flera valda delar med olika material. */}
        {value === MIXED && <option value={MIXED}>Olika material</option>}
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
        {value !== MIXED && !choices.some((m) => m.id === value) && (
          <option value={value}>{materialTitle(value)}</option>
        )}
        <option value={EDIT_MATERIALS}>Redigera materiallistan…</option>
      </select>
    </label>
  )
}

/** Värdet i materialväljaren när de valda delarna har olika material. */
const MIXED = '\u0000olika'

/**
 * Flera valda delar: det som går att ändra på alla på en gång. Namnen står som en lista; ett tryck
 * på ett namn väljer bara den delen.
 */
function MultiProperties({ ids }: { ids: readonly string[] }) {
  const doc = useDocumentStore((s) => s.doc)
  const updateParts = useDocumentStore((s) => s.updateParts)
  const duplicateSelection = useDocumentStore((s) => s.duplicateSelection)
  const deleteSelection = useDocumentStore((s) => s.deleteSelection)
  const select = useDocumentStore((s) => s.select)
  const all = resolveBodies(doc)
  const chosen = ids.flatMap((id) => all.filter((b) => b.id === id))
  const first = chosen[0]
  const def = first && doc.defs.find((d) => d.id === first.defId)
  if (!first || !def) return null
  const parts = chosen.filter((b) => !b.tool)
  const materials = new Set(parts.map((b) => b.material))
  return (
    <div className="flex flex-col gap-4">
      <Group title={`${chosen.length} delar valda`}>
        <ul className="flex flex-wrap gap-1.5">
          {chosen.map((b) => (
            <li key={b.id}>
              <button
                className="h-8 cursor-pointer rounded-md bg-button px-2.5 text-[13px] hover:bg-hover"
                onClick={() => select({ kind: 'body', id: b.id })}
              >
                {b.name}
              </button>
            </li>
          ))}
        </ul>
        {parts.length > 0 && (
          <>
            <MaterialField
              value={materials.size === 1 ? [...materials][0]! : MIXED}
              onChange={(material) =>
                updateParts(
                  parts.map((b) => b.id),
                  { material },
                )
              }
            />
            <PaintField instanceId={first.id} def={def} ids={parts.map((b) => b.id)} />
          </>
        )}
        <p className="text-xs text-faint">
          Skift-klicka på delar, eller Skift-dra runt dem, för att lägga till fler. På pekskärm: tryck på Fler. Mått
          ändrar du på en del i taget.
        </p>
      </Group>
      <div className="grid grid-cols-2 gap-2">
        <button className={secondaryButton} onClick={duplicateSelection}>
          <Copy {...ICON_SM} />
          Länkade kopior
        </button>
        <button className={dangerButton} onClick={deleteSelection}>
          <Trash2 {...ICON_SM} />
          Ta bort alla
        </button>
      </div>
    </div>
  )
}

export function Properties() {
  const selection = useDocumentStore((s) => s.selection)
  const doc = useDocumentStore((s) => s.doc)
  const updatePart = useDocumentStore((s) => s.updatePart)
  const deleteSelection = useDocumentStore((s) => s.deleteSelection)
  const duplicateLinked = useDocumentStore((s) => s.duplicateLinked)
  const makeUnique = useDocumentStore((s) => s.makeUnique)
  const also = useDocumentStore((s) => s.also)

  const body = selection?.kind === 'body' ? resolveBodies(doc).find((b) => b.id === selection.id) : undefined
  const def = body && doc.defs.find((d) => d.id === body.defId)
  const inst = body && doc.instances.find((i) => i.id === body.id)
  const copies = def ? (instanceCounts(doc).get(def.id) ?? 0) : 0
  const sketch = selection?.kind === 'sketch' ? doc.sketches.find((s) => s.id === selection.id) : undefined
  const isEmpty = doc.instances.length === 0 && doc.sketches.length === 0 && doc.params.length === 0

  return (
    <section className="flex flex-1 flex-col group-data-[tab=cutlist]/sheet:hidden group-data-[tab=params]/sheet:hidden">
      <h2 className={sectionTitle}>Egenskaper</h2>
      {body && also.length > 0 ? (
        <MultiProperties ids={[body.id, ...also]} />
      ) : body && def ? (
        <div className="flex flex-col gap-4">
          {/* Ett verktyg: först vad det formar. Material, färg, fiber och kopior gäller det inte. */}
          {body.tool && <ToolCard body={body} />}
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
            {!body.tool && (
              <>
                <MaterialField value={def.material} onChange={(material) => updatePart(body.id, { material })} />
                <PaintField instanceId={body.id} def={def} />
                {/* Samma som ett trippelklick på delen. */}
                <button
                  className="-mx-1 flex cursor-pointer items-center gap-1.5 self-start rounded-md px-1 py-0.5 text-[13px] text-accent hover:bg-hover"
                  onClick={() => selectConnected(body.id)}
                >
                  <Boxes {...ICON_SM} />
                  Välj allt som sitter ihop
                </button>
              </>
            )}
          </Group>

          {/* Utan fiber (MDF, glas) följer fälten delens axlar; kaplistan tar det längsta som L. */}
          <Group title="Mått" note={materialSpec(def.material).grain && !body.tool ? 'mm · L går längs fibern' : 'mm'}>
            {/* Tipset om parametrar syns bara medan man ändrar ett mått. */}
            <div className="group/dims flex flex-col gap-1.5">
              <ExtentFields body={body} def={def} />
              <p className="hidden text-xs text-faint group-focus-within/dims:block">
                Skriv ett parameternamn, t.ex. <code>tjocklek</code>, så följer måttet parametern.
              </p>
            </div>
            {!body.tool && <GrainControls body={body} def={def} />}
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

          {!body.tool && (
            <>
              <HostTools body={body} />
              {/* Länkade kopior delar form (PartDef); det är så man gör fyra likadana ben. */}
              <Group title="Likadana delar" note={copies > 1 && <span className="text-accent">{copies} st</span>}>
                <p className="text-[13px] text-muted">
                  {copies > 1 ? (
                    <>
                      {def.name} finns {copies} gånger, länkade: ändrar du måtten på en ändras alla. Gör unik om just
                      den här ska få egna mått.
                      {isMirrored(body.frame) && ' Den här är spegelvänd: hål och tappar sitter åt andra hållet.'}
                    </>
                  ) : (
                    <>
                      Behöver du fler likadana, t.ex. fyra ben? En länkad kopia får samma mått och följer med när du
                      ändrar dem.
                    </>
                  )}
                </p>
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
            </>
          )}
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
