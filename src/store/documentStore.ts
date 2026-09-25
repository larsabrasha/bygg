import { create, type StoreApi } from 'zustand'
import { evaluate, isConstant, NAME_PATTERN, renameIdentifier } from '../model/expr'
import { bodyExtents, faceAxis, isValidRect, nextPartName, pushPullBody, sketchToPart } from '../model/geometry'
import { newId } from '../model/id'
import { applyParams, evaluateParams, isNameUsed, paramScope, setBoxExtent } from '../model/params'
import { withAxes } from '../model/partAxes'
import { resolveBodies } from '../model/resolve'
import type { Axis, DimExprs, Face, Frame, ModelDocument, PartDef, Rect, Vec3 } from '../model/types'
import { add, scale } from '../model/vec'

export type Selection = { kind: 'body' | 'sketch'; id: string }

interface Snapshot {
  doc: ModelDocument
  selection: Selection | null
  past: ModelDocument[]
  future: ModelDocument[]
}

export type PartPatch = Partial<Pick<PartDef, 'name' | 'material' | 'grainAxis' | 'thicknessAxis'>>

interface DocumentState extends Snapshot {
  /** Returnerar skissens id, eller null om rektangeln är för liten. */
  addSketch: (frame: Frame, rect: Rect, dims?: DimExprs) => string | null
  /** Drar ut en skiss till en ny del. Skissen försvinner. Returnerar kopians id. */
  pushPullSketch: (sketchId: string, distance: number, depthExpr?: string) => string | null
  /** Flyttar en sida på en del (och alla dess kopior). False om resultatet blir ogiltigt. */
  pushPullBody: (instanceId: string, face: Face, distance: number) => boolean
  moveInstance: (instanceId: string, delta: Vec3) => void
  /** Ny kopia som delar form med originalet. Returnerar den nya kopians id. */
  duplicateLinked: (instanceId: string) => string | null
  /** Ger kopian en egen form, så att den inte längre ändras med de andra. */
  makeUnique: (instanceId: string) => void
  updatePart: (instanceId: string, patch: PartPatch) => void
  /** Sätter en axels längd från ett tal eller ett uttryck. Returnerar felmeddelande eller null. */
  setExtent: (instanceId: string, axis: Axis, text: string) => string | null
  addParam: () => string
  /** Returnerar felmeddelande eller null. */
  updateParam: (id: string, patch: { name?: string; expr?: string }) => string | null
  /** False om parametern används någonstans. */
  deleteParam: (id: string) => boolean
  deleteSelection: () => void
  select: (selection: Selection | null) => void
  /** Tömmer modellen. Går att ångra. */
  clearDocument: () => void
  /** Ersätter dokumentet, t.ex. vid inläsning. Rensar historiken. */
  load: (doc: ModelDocument) => void
  undo: () => void
  redo: () => void
}

const HISTORY_LIMIT = 100
/** Avstånd mellan original och ny kopia, i mm. */
const DUPLICATE_GAP = 50

export const emptyDocument = (): ModelDocument => ({ sketches: [], defs: [], instances: [], params: [] })

const emptySnapshot = (): Snapshot => ({ doc: emptyDocument(), selection: null, past: [], future: [] })

function selectionExists(doc: ModelDocument, sel: Selection | null): Selection | null {
  if (!sel) return null
  const list = sel.kind === 'body' ? doc.instances : doc.sketches
  return list.some((x) => x.id === sel.id) ? sel : null
}

/** Formen med dims ersatt; dims tas bort helt om den blir tom. */
function withDims(def: PartDef, dims: DimExprs): PartDef {
  const { dims: _old, ...rest } = def
  void _old
  return Object.keys(dims).length ? { ...rest, dims } : rest
}

function withoutAxis(dims: DimExprs | undefined, axis: Axis): DimExprs {
  const out = { ...dims }
  delete out[axis]
  return out
}

/** Tar bort former som inga kopior längre använder. */
function pruneDefs(doc: ModelDocument): ModelDocument {
  const used = new Set(doc.instances.map((i) => i.defId))
  return doc.defs.every((d) => used.has(d.id)) ? doc : { ...doc, defs: doc.defs.filter((d) => used.has(d.id)) }
}

// Vid HMR körs modulen om och en ny store skapas. Dokumentet tas då över
// från förra storen, så att nya actions laddas in men datan ligger kvar.
// (hot.dispose räcker inte: Vite anropar den bara för moduler som själva
// accepterar uppdateringen, och här är det komponenterna som gör det.)
const previous = import.meta.hot?.data.documentStore as StoreApi<DocumentState> | undefined
const previousState = previous?.getState()
const initial: Snapshot =
  // Dokument från en äldre version av koden (utan kopior eller fiberaxlar) tas inte över.
  previousState && Array.isArray(previousState.doc.instances) && previousState.doc.defs.every((d) => d.grainAxis)
    ? {
        doc: previousState.doc,
        selection: previousState.selection,
        past: previousState.past,
        future: previousState.future,
      }
    : emptySnapshot()

export const useDocumentStore = create<DocumentState>()((set, get) => {
  /** Sparar nuvarande dokument i historiken och byter till next (med parametrar omräknade). */
  const commit = (next: ModelDocument, selection: Selection | null = get().selection) => {
    const { doc, past } = get()
    const applied = pruneDefs(applyParams(next))
    set({
      doc: applied,
      selection: selectionExists(applied, selection),
      past: [...past, doc].slice(-HISTORY_LIMIT),
      future: [],
    })
  }

  const findInstance = (id: string) => {
    const { doc } = get()
    const inst = doc.instances.find((i) => i.id === id)
    const def = inst && doc.defs.find((d) => d.id === inst.defId)
    return inst && def ? { inst, def } : null
  }

  const replaceDef = (doc: ModelDocument, def: PartDef): ModelDocument => ({
    ...doc,
    defs: doc.defs.map((d) => (d.id === def.id ? def : d)),
  })

  return {
    ...initial,

    addSketch: (frame, rect, dims) => {
      if (!isValidRect(rect)) return null
      const { doc } = get()
      const sketch = { id: newId(), frame, rect, ...(dims && Object.keys(dims).length ? { dims } : {}) }
      commit({ ...doc, sketches: [...doc.sketches, sketch] }, { kind: 'sketch', id: sketch.id })
      return sketch.id
    },

    pushPullSketch: (sketchId, distance, depthExpr) => {
      const { doc } = get()
      const sketch = doc.sketches.find((s) => s.id === sketchId)
      if (!sketch) return null
      const part = sketchToPart(
        sketch,
        distance,
        { defId: newId(), instanceId: newId(), name: nextPartName(doc.defs), material: 'furu' },
        depthExpr,
      )
      if (!part) return null
      commit(
        {
          ...doc,
          sketches: doc.sketches.filter((s) => s.id !== sketchId),
          defs: [...doc.defs, part.def],
          instances: [...doc.instances, part.instance],
        },
        { kind: 'body', id: part.instance.id },
      )
      return part.instance.id
    },

    pushPullBody: (instanceId, face, distance) => {
      const found = findInstance(instanceId)
      const next = found && pushPullBody(found.def, face, distance)
      if (!next) return false
      // Handpåläggning vinner: axeln slutar styras av sitt uttryck.
      const def = withDims(next, withoutAxis(next.dims, faceAxis(face)))
      commit(replaceDef(get().doc, def), { kind: 'body', id: instanceId })
      return true
    },

    moveInstance: (instanceId, delta) => {
      const { doc } = get()
      commit({
        ...doc,
        instances: doc.instances.map((i) =>
          i.id === instanceId ? { ...i, frame: { ...i.frame, origin: add(i.frame.origin, delta) } } : i,
        ),
      })
    },

    duplicateLinked: (instanceId) => {
      const found = findInstance(instanceId)
      if (!found) return null
      const { inst, def } = found
      const body = resolveBodies(get().doc).find((b) => b.id === instanceId)!
      const offset = scale(inst.frame.u, bodyExtents(body)[0] + DUPLICATE_GAP)
      const copy = { id: newId(), defId: def.id, frame: { ...inst.frame, origin: add(inst.frame.origin, offset) } }
      const { doc } = get()
      commit({ ...doc, instances: [...doc.instances, copy] }, { kind: 'body', id: copy.id })
      return copy.id
    },

    makeUnique: (instanceId) => {
      const found = findInstance(instanceId)
      if (!found) return
      const { doc } = get()
      const def: PartDef = { ...found.def, id: newId(), name: nextPartName(doc.defs) }
      commit({
        ...doc,
        defs: [...doc.defs, def],
        instances: doc.instances.map((i) => (i.id === instanceId ? { ...i, defId: def.id } : i)),
      })
    },

    updatePart: (instanceId, patch) => {
      const found = findInstance(instanceId)
      if (!found || Object.entries(patch).every(([k, v]) => found.def[k as keyof PartDef] === v)) return
      // Fiber och tjocklek måste ligga på olika axlar; withAxes löser krockar.
      commit(replaceDef(get().doc, { ...found.def, ...patch, ...withAxes(found.def, patch) }))
    },

    setExtent: (instanceId, axis, text) => {
      const found = findInstance(instanceId)
      if (!found) return 'Delen finns inte'
      const { doc } = get()
      const scope = paramScope(doc.params)
      const r = evaluate(text, (n) => scope.get(n))
      if (!r.ok) return r.error
      const current = found.def.dims?.[axis]
      const anchor = current?.anchor ?? 'min'
      const resized = setBoxExtent(found.def, axis, Math.abs(r.value), anchor)
      if (!resized) return 'För litet mått'
      // Bara uttryck med parametrar sparas; ett rent tal är bara ett tal.
      const rest = withoutAxis(found.def.dims, axis)
      const dims = isConstant(text) ? rest : { ...rest, [axis]: { expr: text.trim(), anchor } }
      commit(replaceDef(doc, withDims(resized, dims)))
      return null
    },

    addParam: () => {
      const { doc } = get()
      const used = new Set(doc.params.map((p) => p.name))
      let n = 1
      while (used.has(`mått${n}`)) n++
      const param = { id: newId(), name: `mått${n}`, expr: '100', value: 100 }
      commit({ ...doc, params: [...doc.params, param] })
      return param.id
    },

    updateParam: (id, patch) => {
      const { doc } = get()
      const param = doc.params.find((p) => p.id === id)
      if (!param) return 'Parametern finns inte'
      let next = doc

      if (patch.name !== undefined && patch.name !== param.name) {
        const name = patch.name.trim()
        if (!NAME_PATTERN.test(name))
          return 'Namnet får bara innehålla bokstäver, siffror och _, och inte börja med en siffra'
        if (doc.params.some((p) => p.id !== id && p.name === name)) return `"${name}" finns redan`
        const rename = (e: string) => renameIdentifier(e, param.name, name)
        const renameDims = <T extends { dims?: DimExprs }>(x: T): T =>
          x.dims
            ? {
                ...x,
                dims: Object.fromEntries(Object.entries(x.dims).map(([k, d]) => [k, { ...d, expr: rename(d.expr) }])),
              }
            : x
        next = {
          ...next,
          params: next.params.map((p) => ({ ...p, name: p.id === id ? name : p.name, expr: rename(p.expr) })),
          defs: next.defs.map(renameDims),
          sketches: next.sketches.map(renameDims),
        }
      }

      if (patch.expr !== undefined) {
        const params = next.params.map((p) => (p.id === id ? { ...p, expr: patch.expr!.trim() } : p))
        const r = evaluateParams(params).get(id)
        if (!r?.ok) return r?.error ?? 'Ogiltigt uttryck'
        next = { ...next, params }
      }

      if (next !== doc) commit(next)
      return null
    },

    deleteParam: (id) => {
      const { doc } = get()
      const param = doc.params.find((p) => p.id === id)
      if (!param) return false
      const rest = { ...doc, params: doc.params.filter((p) => p.id !== id) }
      if (isNameUsed(rest, param.name)) return false
      commit(rest)
      return true
    },

    deleteSelection: () => {
      const { doc, selection } = get()
      if (!selection) return
      commit(
        selection.kind === 'body'
          ? { ...doc, instances: doc.instances.filter((i) => i.id !== selection.id) }
          : { ...doc, sketches: doc.sketches.filter((s) => s.id !== selection.id) },
        null,
      )
    },

    select: (selection) => set({ selection }),

    clearDocument: () => commit(emptyDocument(), null),

    load: (doc) => set({ doc: applyParams(doc), selection: null, past: [], future: [] }),

    undo: () => {
      const { doc, past, future, selection } = get()
      const prev = past.at(-1)
      if (!prev) return
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], selection: selectionExists(prev, selection) })
    },

    redo: () => {
      const { doc, past, future, selection } = get()
      const next = future[0]
      if (!next) return
      set({ doc: next, past: [...past, doc], future: future.slice(1), selection: selectionExists(next, selection) })
    },
  }
})

if (import.meta.hot) import.meta.hot.data.documentStore = useDocumentStore

/** Alla kopior ihopslagna med sina former. Stabil referens per dokument. */
export const useBodies = () => useDocumentStore((s) => resolveBodies(s.doc))

/** Endast för tester. */
export function resetDocumentStore() {
  useDocumentStore.setState(emptySnapshot())
}
