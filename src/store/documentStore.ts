import { create, type StoreApi } from 'zustand'
import { evaluate, isConstant, NAME_PATTERN, renameIdentifier } from '../model/expr'
import {
  bodyCenter,
  bodyExtents,
  faceAxis,
  isValidRect,
  linkedAxes,
  nextPartName,
  pushPullBody,
  sketchToPart,
} from '../model/geometry'
import { rotateFrame } from '../model/frame'
import { carryTools, combineError, detachOrphans, jointError, sketchCombine, type SketchMode } from '../model/combine'
import { tenonFor } from '../model/joint'
import { newId } from '../model/id'
import { applyParams, evaluateParams, isNameUsed, paramScope, setBoxExtent } from '../model/params'
import { defaultAxes, withAxes } from '../model/partAxes'
import { minCorner, placeAlong, WORLD_AXES, withoutPos } from '../model/placement'
import { resolveBodies } from '../model/resolve'
import type {
  Axis,
  Combine,
  DimExprs,
  Face,
  Frame,
  Instance,
  ModelDocument,
  PartDef,
  Rect,
  Shape,
  Vec3,
  WorldAxis,
} from '../model/types'
import { anglesOf, restOf, withAngles } from '../model/orientation'
import { add, scale } from '../model/vec'

/** Det valda. För en del också ytan man tryckte på; den får pilen för push/pull. */
export type Selection = { kind: 'sketch'; id: string } | { kind: 'body'; id: string; face?: Face }

interface Snapshot {
  doc: ModelDocument
  selection: Selection | null
  past: ModelDocument[]
  future: ModelDocument[]
}

export type PartPatch = Partial<Pick<PartDef, 'name' | 'material' | 'grainAxis' | 'thicknessAxis'>>

interface DocumentState extends Snapshot {
  /**
   * Returnerar skissens id, eller null om rektangeln är för liten. shape = cirkel
   * inskriven i rect. on = kopian skissen ritas på.
   */
  addSketch: (frame: Frame, rect: Rect, dims?: DimExprs, shape?: Shape, on?: string) => string | null
  /** Drar ut en skiss till en ny del. Skissen försvinner. Returnerar kopians id. */
  pushPullSketch: (sketchId: string, distance: number, depthExpr?: string, mode?: SketchMode) => string | null
  /** Flyttar en sida på en del (och alla dess kopior). False om resultatet blir ogiltigt. */
  pushPullBody: (instanceId: string, face: Face, distance: number) => boolean
  moveInstance: (instanceId: string, delta: Vec3) => void
  /** Vrider en kopia degrees grader runt en axel (enhetsvektor) genom center. */
  rotateInstance: (instanceId: string, center: Vec3, axis: Vec3, degrees: number) => void
  /**
   * Sätter en av vinklarna i detaljpanelen (grader, från viloläget) och vrider
   * runt delens mitt. Tar emot uttryck, men sparar bara värdet. Returnerar felmeddelande eller null.
   */
  setAngle: (instanceId: string, axis: WorldAxis, text: string) => string | null
  /**
   * Länkade kopior av en kopia, en per frame, i ett steg. Den sista blir vald.
   * Kopiorna får inga lägesuttryck (de skulle dra dem tillbaka till originalet).
   * Returnerar de nya id:na.
   */
  addCopies: (sourceId: string, frames: readonly Frame[]) => string[]
  /** Ny kopia som delar form med originalet. Returnerar den nya kopians id. */
  duplicateLinked: (instanceId: string) => string | null
  /** Ger kopian en egen form, så att den inte längre ändras med de andra. */
  makeUnique: (instanceId: string) => void
  updatePart: (instanceId: string, patch: PartPatch) => void
  /** Sätter en axels längd från ett tal eller ett uttryck. Returnerar felmeddelande eller null. */
  setExtent: (instanceId: string, axis: Axis, text: string) => string | null
  /** Sätter läget för delens hörn närmast origo längs en världsaxel, från ett tal eller ett uttryck. */
  setPosition: (instanceId: string, axis: WorldAxis, text: string) => string | null
  addParam: () => string
  /** Returnerar felmeddelande eller null. */
  updateParam: (id: string, patch: { name?: string; expr?: string }) => string | null
  /** False om parametern används någonstans. */
  deleteParam: (id: string) => boolean
  /** Tar bort det valda. En del som har verktyg tar dem med sig. */
  deleteSelection: () => void
  /**
   * Gör toolId till ett verktyg som läggs till på eller skärs ut ur hostId.
   * Värden blir vald. Returnerar felmeddelande eller null.
   */
  combine: (toolId: string, op: Combine['op'], hostId: string) => string | null
  /** Lossar ett verktyg: det blir en vanlig del igen, där det står, och blir valt. */
  detach: (toolId: string) => void
  /**
   * En tapp på hostId (t.ex. en sarg) in i intoId (ett ben), med tapphål i
   * intoId. Värden blir vald. Returnerar felmeddelande eller null.
   */
  joint: (hostId: string, intoId: string) => string | null
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

/** dims utan axeln, och för en cirkel utan båda profilaxlarna: de styr samma diameter (se linkedAxes). */
function withoutAxis(dims: DimExprs | undefined, axis: Axis, box: Pick<PartDef, 'shape'> = {}): DimExprs {
  const out = { ...dims }
  for (const a of linkedAxes(box, axis)) delete out[a]
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
    // Verktyg följer sin värd när den flyttas; verktyg utan värd blir vanliga delar.
    const applied = pruneDefs(detachOrphans(carryTools(doc, applyParams(next))))
    set({
      doc: applied,
      selection: selectionExists(applied, selection),
      past: [...past, doc].slice(-HISTORY_LIMIT),
      future: [],
    })
  }

  /**
   * Ger en kopia ny riktning (och origo). Viloläget sparas första gången, så
   * att vinklarna räknas från hur den låg innan. Som vid flytt: flyttas hörnet
   * närmast origo längs en axel, slutar den axeln styras av sitt uttryck.
   */
  const reorient = (inst: Instance, def: PartDef, frame: Frame) => {
    const next = { ...inst, frame, rest: restOf(inst) }
    const before = minCorner(inst, def)
    const after = minCorner(next, def)
    const moved = WORLD_AXES.filter((_, k) => Math.abs(after[k]! - before[k]!) > 1e-6)
    const { doc } = get()
    commit({ ...doc, instances: doc.instances.map((i) => (i.id === inst.id ? withoutPos(next, moved) : i)) })
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

    addSketch: (frame, rect, dims, shape, on) => {
      if (!isValidRect(rect)) return null
      const { doc } = get()
      const sketch = {
        id: newId(),
        frame,
        rect,
        ...(shape && { shape }),
        ...(on && { on }),
        ...(dims && Object.keys(dims).length ? { dims } : {}),
      }
      commit({ ...doc, sketches: [...doc.sketches, sketch] }, { kind: 'sketch', id: sketch.id })
      return sketch.id
    },

    pushPullSketch: (sketchId, distance, depthExpr, mode) => {
      const { doc } = get()
      const sketch = doc.sketches.find((s) => s.id === sketchId)
      if (!sketch) return null
      // På en del: ett urtag i den eller ett tillägg på den, i stället för en ny del.
      const combine = sketchCombine(doc, sketch, distance, mode)
      const host = combine?.host
      const name = nextPartName(doc.defs, !combine ? 'Del' : combine.op === 'subtract' ? 'Urtag' : 'Tillägg')
      const part = sketchToPart(
        sketch,
        distance,
        { defId: newId(), instanceId: newId(), name, material: 'furu' },
        depthExpr,
      )
      if (!part) return null
      const instance = combine ? { ...part.instance, combine } : part.instance
      commit(
        {
          ...doc,
          sketches: doc.sketches.filter((s) => s.id !== sketchId),
          defs: [...doc.defs, part.def],
          instances: [...doc.instances, instance],
        },
        // Den utdragna ytan blir vald, så att man kan dra vidare i den. Ett urtag eller
        // tillägg: delen det sitter på, så att man ser resultatet (och verktyget som spöke).
        host ? { kind: 'body', id: host } : { kind: 'body', id: part.instance.id, face: distance >= 0 ? 'n+' : 'n-' },
      )
      return instance.id
    },

    pushPullBody: (instanceId, face, distance) => {
      const found = findInstance(instanceId)
      const next = found && pushPullBody(found.def, face, distance)
      if (!next) return false
      // Handpåläggning vinner: axeln slutar styras av sitt uttryck.
      const def = withDims(next, withoutAxis(next.dims, faceAxis(face), next))
      // Flyttas hörnet närmast origo (sidan närmast origo, eller en cylinder som
      // blir tjockare åt båda håll), slutar läget längs den axeln att styras av
      // sitt uttryck, annars skulle delen flytta tillbaka och växa åt andra hållet.
      const doc = replaceDef(get().doc, def)
      const instances = doc.instances.map((i) => {
        if (i.defId !== def.id || !i.pos) return i
        const before = minCorner(i, found.def)
        const after = minCorner(i, def)
        return withoutPos(
          i,
          WORLD_AXES.filter((_, k) => Math.abs(after[k]! - before[k]!) > 1e-6),
        )
      })
      commit({ ...doc, instances }, { kind: 'body', id: instanceId, face })
      return true
    },

    moveInstance: (instanceId, delta) => {
      const { doc } = get()
      commit({
        ...doc,
        instances: doc.instances.map((i) =>
          i.id === instanceId
            ? withoutPos(
                { ...i, frame: { ...i.frame, origin: add(i.frame.origin, delta) } },
                WORLD_AXES.filter((_, k) => delta[k] !== 0),
              )
            : i,
        ),
      })
    },

    rotateInstance: (instanceId, center, axis, degrees) => {
      const found = findInstance(instanceId)
      if (!found || degrees % 360 === 0) return
      reorient(found.inst, found.def, rotateFrame(found.inst.frame, center, axis, degrees))
    },

    setAngle: (instanceId, axis, text) => {
      const found = findInstance(instanceId)
      if (!found) return 'Delen finns inte'
      const scope = paramScope(get().doc.params)
      const r = evaluate(text, (n) => scope.get(n))
      if (!r.ok) return r.error
      const { inst, def } = found
      const rest = restOf(inst)
      const angles = anglesOf(inst.frame, rest)
      const i = WORLD_AXES.indexOf(axis)
      if (angles[i] === r.value) return null
      angles[i] = r.value
      const body = resolveBodies(get().doc).find((b) => b.id === instanceId)!
      reorient(inst, def, withAngles(inst.frame, rest, bodyCenter(body), angles))
      return null
    },

    addCopies: (sourceId, frames) => {
      const found = findInstance(sourceId)
      if (!found || frames.length === 0) return []
      // Kopiorna räknar sina vinklar från samma viloläge som originalet.
      const rest = restOf(found.inst)
      const copies = frames.map((frame) => ({ id: newId(), defId: found.def.id, frame, rest }))
      const { doc } = get()
      commit({ ...doc, instances: [...doc.instances, ...copies] }, { kind: 'body', id: copies.at(-1)!.id })
      return copies.map((c) => c.id)
    },

    duplicateLinked: (instanceId) => {
      const found = findInstance(instanceId)
      if (!found) return null
      const { inst, def } = found
      const body = resolveBodies(get().doc).find((b) => b.id === instanceId)!
      const offset = scale(inst.frame.u, bodyExtents(body)[0] + DUPLICATE_GAP)
      const copy = {
        id: newId(),
        defId: def.id,
        frame: { ...inst.frame, origin: add(inst.frame.origin, offset) },
        ...(inst.rest && { rest: inst.rest }),
      }
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
      const rest = withoutAxis(found.def.dims, axis, found.def)
      const dims = isConstant(text) ? rest : { ...rest, [axis]: { expr: text.trim(), anchor } }
      commit(replaceDef(doc, withDims(resized, dims)))
      return null
    },

    setPosition: (instanceId, axis, text) => {
      const found = findInstance(instanceId)
      if (!found) return 'Delen finns inte'
      const { doc } = get()
      const scope = paramScope(doc.params)
      const r = evaluate(text, (n) => scope.get(n))
      if (!r.ok) return r.error
      const placed = placeAlong(withoutPos(found.inst, [axis]), found.def, axis, r.value)
      // Bara uttryck med parametrar sparas; ett rent tal är bara ett läge.
      const inst = isConstant(text) ? placed : { ...placed, pos: { ...placed.pos, [axis]: text.trim() } }
      commit({ ...doc, instances: doc.instances.map((i) => (i.id === instanceId ? inst : i)) })
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
          instances: next.instances.map((i) =>
            i.pos ? { ...i, pos: Object.fromEntries(Object.entries(i.pos).map(([k, e]) => [k, rename(e)])) } : i,
          ),
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
          ? {
              ...doc,
              instances: doc.instances.filter((i) => i.id !== selection.id && i.combine?.host !== selection.id),
            }
          : { ...doc, sketches: doc.sketches.filter((s) => s.id !== selection.id) },
        null,
      )
    },

    combine: (toolId, op, hostId) => {
      const { doc } = get()
      const error = combineError(doc, toolId, hostId)
      if (error) return error
      commit(
        {
          ...doc,
          instances: doc.instances.map((i) => (i.id === toolId ? { ...i, combine: { op, host: hostId } } : i)),
        },
        { kind: 'body', id: hostId },
      )
      return null
    },

    joint: (hostId, intoId) => {
      const { doc } = get()
      const error = jointError(doc, hostId, intoId)
      if (error) return error
      const bodies = resolveBodies(doc)
      const host = bodies.find((b) => b.id === hostId)!
      const into = bodies.find((b) => b.id === intoId)!
      const tenon = tenonFor(host, into)
      if (typeof tenon === 'string') return tenon
      const box = { profile: tenon.profile, ...(tenon.shape && { shape: tenon.shape }), z0: 0, z1: tenon.depth }
      const def: PartDef = {
        id: newId(),
        name: nextPartName(doc.defs, 'Tapp'),
        material: host.material,
        ...defaultAxes(box),
        ...box,
      }
      const instance: Instance = {
        id: newId(),
        defId: def.id,
        frame: tenon.frame,
        combine: { op: 'joint', host: hostId, into: intoId },
      }
      commit(
        { ...doc, defs: [...doc.defs, def], instances: [...doc.instances, instance] },
        { kind: 'body', id: hostId },
      )
      return null
    },

    detach: (toolId) => {
      const { doc } = get()
      if (!doc.instances.some((i) => i.id === toolId && i.combine)) return
      commit(
        {
          ...doc,
          instances: doc.instances.map((i) => {
            if (i.id !== toolId) return i
            const { combine: _gone, ...rest } = i
            void _gone
            return rest
          }),
        },
        { kind: 'body', id: toolId },
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
