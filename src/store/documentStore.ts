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
  uniqueCopyName,
} from '../model/geometry'
import { rotateFrame } from '../model/frame'
import { bodiesBox } from '../model/geometry'
import {
  carryTools,
  combineError,
  detachOrphans,
  jointError,
  jointTwins,
  relativeFrame,
  sketchCombine,
  syncJointTwins,
  type SketchMode,
} from '../model/combine'
import { refitJoints, tenonFor } from '../model/joint'
import { newId } from '../model/id'
import { embedMaterials } from '../model/catalog'
import { limitError } from '../model/limits'
import { applyParams, evaluateParams, isNameUsed, paramScope, setBoxExtent } from '../model/params'
import { defaultAxes, withAxes } from '../model/partAxes'
import { minCorner, placeAlong, WORLD_AXES, withoutPos } from '../model/placement'
import { resolveBodies } from '../model/resolve'
import type {
  Axis,
  Body,
  Combine,
  DimExpr,
  DimExprs,
  Face,
  Frame,
  Instance,
  ModelDocument,
  PartDef,
  Rect,
  Shape,
  StockSettings,
  StockSize,
  Vec3,
  WorldAxis,
} from '../model/types'
import { DEFAULT_MATERIAL } from '../model/types'
import { anglesOf, restOf, withAngles } from '../model/orientation'
import { add, scale } from '../model/vec'
import { useLibraryStore } from './libraryStore'

/** Det valda. För en del också ytan man tryckte på; den får pilen för push/pull. */
export type Selection = { kind: 'sketch'; id: string } | { kind: 'body'; id: string; face?: Face }

/** Ett steg i ångra-historiken: dokumentet och det som var valt då. */
export interface HistoryEntry {
  doc: ModelDocument
  selection: Selection | null
}

interface Snapshot {
  doc: ModelDocument
  selection: Selection | null
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export type PartPatch = Partial<Pick<PartDef, 'name' | 'material' | 'grainAxis' | 'thicknessAxis' | 'paint'>>

interface DocumentState extends Snapshot {
  /**
   * Fler valda delar, utöver selection (som då är en del). Tomt när bara en sak är vald.
   * Inte med i ångra-historiken: efter ångra är bara det som var valt då valt.
   */
  also: string[]
  /**
   * Lägger till delen i valet, eller tar bort den om den redan är vald (Skift-klick, Välj fler).
   * Den senast tillagda blir selection, den som pilarna och Egenskaper gäller.
   */
  toggleSelected: (id: string) => void
  /** Väljer delarna; den sista blir selection. */
  selectBodies: (ids: readonly string[]) => void
  /**
   * Returnerar skissens id, eller null om rektangeln är för liten. shape = cirkel
   * inskriven i rect. on = kopian skissen ritas på.
   */
  addSketch: (frame: Frame, rect: Rect, dims?: DimExprs, shape?: Shape, on?: string) => string | null
  /** Drar ut en skiss till en ny del. Skissen försvinner. Returnerar kopians id. */
  pushPullSketch: (sketchId: string, distance: number, depthExpr?: string, mode?: SketchMode) => string | null
  /** Flyttar en sida på en del (och alla dess kopior). False om resultatet blir ogiltigt. */
  /** dim: måttet längs sidans axel ska styras av ett uttryck (hela måttet skrevs som en parameter). */
  pushPullBody: (instanceId: string, face: Face, distance: number, dim?: DimExpr) => boolean
  moveInstance: (instanceId: string, delta: Vec3) => void
  /** Flyttar flera kopior lika mycket, i ett steg. */
  moveInstances: (ids: readonly string[], delta: Vec3) => void
  /** Vrider en kopia degrees grader runt en axel (enhetsvektor) genom center. */
  rotateInstance: (instanceId: string, center: Vec3, axis: Vec3, degrees: number) => void
  /** Vrider flera kopior runt samma axel genom center, i ett steg. */
  rotateInstances: (ids: readonly string[], center: Vec3, axis: Vec3, degrees: number) => void
  /**
   * En länkad kopia av var och en av delarna, med frame ändrad av transform, i ett steg.
   * Kopiorna blir valda. Returnerar deras id:n, i samma ordning.
   */
  copyInstances: (ids: readonly string[], transform: (frame: Frame) => Frame) => string[]
  /** Länkade kopior av alla valda delar, bredvid dem (längs x), som duplicateLinked för en. */
  duplicateSelection: () => void
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
  /** Samma ändring på flera delars former, i ett steg (t.ex. material på alla valda). */
  updateParts: (ids: readonly string[], patch: PartPatch) => void
  /** Sätter en axels längd från ett tal eller ett uttryck. Returnerar felmeddelande eller null. */
  setExtent: (instanceId: string, axis: Axis, text: string) => string | null
  /** Sätter läget för delens hörn närmast origo längs en världsaxel, från ett tal eller ett uttryck. */
  setPosition: (instanceId: string, axis: WorldAxis, text: string) => string | null
  /** Null om modellen redan har så många parametrar den får ha. */
  addParam: () => string | null
  /** Returnerar felmeddelande eller null. */
  updateParam: (id: string, patch: { name?: string; expr?: string }) => string | null
  /** False om parametern används någonstans. */
  deleteParam: (id: string) => boolean
  /**
   * Tar bort det valda. En del som har verktyg tar dem med sig. Ett verktyg: delen det satt på blir vald.
   * En tapp tar sina tvillingar med sig (se jointTwins).
   */
  /** Lagermåtten för ett material och en tjocklek (stockKey); null (eller tom) går tillbaka till standardmåtten. */
  setStockSizes: (key: string, sizes: StockSize[] | null) => void
  /** Om delar i en grupp (stockKey) får kapas ur spill på ett annat mått. */
  setLeftover: (key: string, on: boolean) => void
  /** Sågbladets bredd och kapmånen för kapschemat, i mm. */
  setStockOptions: (patch: Pick<StockSettings, 'kerf' | 'lengthAllowance'>) => void
  deleteSelection: () => void
  /**
   * Gör toolId till ett verktyg som läggs till på eller skärs ut ur hostId.
   * Värden blir vald. Returnerar felmeddelande eller null.
   */
  combine: (toolId: string, op: Combine['op'], hostId: string) => string | null
  /** Lossar ett verktyg (en tapp med sina tvillingar): det blir en vanlig del igen, där det står, och blir valt. */
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
  /**
   * Uppdaterar modellens kopior av egna material när användarens lista ändrats.
   * Inget ångra-steg: det är inte en ändring av modellen.
   */
  refreshMaterials: () => void
  /** Sätter tillbaka historiken som sparades med dokumentet (se sync/history). Dokumentet rörs inte. */
  setHistory: (past: HistoryEntry[], future: HistoryEntry[]) => void
  undo: () => void
  redo: () => void
}

/**
 * Så många steg går att ångra. Stegen delar det som inte ändrats, så de tar
 * lite plats, också när historiken sparas (sync/history).
 */
export const HISTORY_LIMIT = 500
/** Felet från en action som stoppades av gränserna; själva skälet har redan visats (se refused). */
export const LIMIT_REFUSED = 'Modellen blir för stor'

/** Visar varför en ändring stoppades. Samma meddelande visas en gång åt gången. */
function refused(text: string) {
  const lib = useLibraryStore.getState()
  if (!lib.notices.some((n) => n.text === text)) lib.notify(text)
}

/** Avstånd mellan original och ny kopia, i mm. */
const DUPLICATE_GAP = 50

export const emptyDocument = (): ModelDocument => ({ sketches: [], defs: [], instances: [], params: [] })

const emptySnapshot = (): Snapshot => ({ doc: emptyDocument(), selection: null, past: [], future: [] })

/** Alla valda delar: den valda (selection) först, sedan de tillagda (also). Tomt om ingen del är vald. */
export const selectedBodyIds = (s: Pick<DocumentState, 'selection' | 'also'>): string[] =>
  s.selection?.kind === 'body' ? [s.selection.id, ...s.also] : []

/** also utan det som inte finns i doc längre, och tomt om det valda inte är en del. */
function alsoExisting(doc: ModelDocument, selection: Selection | null, also: readonly string[]): string[] {
  if (selection?.kind !== 'body' || also.length === 0) return []
  const ids = new Set(doc.instances.map((i) => i.id))
  return also.filter((id) => id !== selection.id && ids.has(id))
}

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
        // Historik från före valet sparades i den (bara dokument) tas inte över.
        past: previousState.past.every((e) => 'doc' in e) ? previousState.past : [],
        future: previousState.future.every((e) => 'doc' in e) ? previousState.future : [],
      }
    : emptySnapshot()

/** En tapps form och läge på sin värd, avrundat: lika för kopior som ligger an på samma sätt. */
function roundedTenon(t: Exclude<ReturnType<typeof tenonFor>, string>, host: Body) {
  const r = (x: number) => Math.round(x * 1000) / 1000
  const rel = relativeFrame(host.frame, t.frame)
  return [t.profile, t.shape ?? null, t.depth, rel.origin, rel.u, rel.v, rel.n].map((x) =>
    typeof x === 'object' && x !== null ? Object.values(x).map((v) => (typeof v === 'number' ? r(v) : v)) : x,
  )
}

export const useDocumentStore = create<DocumentState>()((set, get) => {
  /**
   * Sparar nuvarande dokument i historiken och byter till next (med parametrar omräknade).
   * Blir modellen större än gränserna (se model/limits) ändras inget: false, och ett meddelande.
   */
  const commit = (
    next: ModelDocument,
    selection: Selection | null = get().selection,
    // Ett nytt val (t.ex. en ny kopia) ersätter också de tillagda; samma val behåller dem.
    also: readonly string[] = selection === get().selection ? get().also : [],
  ): boolean => {
    const { doc, past, selection: before } = get()
    // Verktyg följer sin värd när den flyttas, en ändrad tapp ändrar sina tvillingar (samma tapp från
    // länkade ben), och tappar räknas om när sargen eller benet ändras; verktyg utan värd blir vanliga delar.
    // Modellen har kopior av de egna material den använder, som följer med när den sparas.
    const carried = syncJointTwins(doc, carryTools(doc, applyParams(next)))
    const applied = embedMaterials(pruneDefs(detachOrphans(refitJoints(doc, carried))))
    const error = limitError(applied, doc)
    if (error) {
      refused(error)
      return false
    }
    const chosen = selectionExists(applied, selection)
    set({
      doc: applied,
      selection: chosen,
      also: alsoExisting(applied, chosen, also),
      past: [...past, { doc, selection: before }].slice(-HISTORY_LIMIT),
      future: [],
    })
    return true
  }

  /**
   * Ger en kopia ny riktning (och origo). Viloläget sparas första gången, så
   * att vinklarna räknas från hur den låg innan. Som vid flytt: flyttas hörnet
   * närmast origo längs en axel, slutar den axeln styras av sitt uttryck.
   */
  const reoriented = (inst: Instance, def: PartDef, frame: Frame): Instance => {
    const next = { ...inst, frame, rest: restOf(inst) }
    const before = minCorner(inst, def)
    const after = minCorner(next, def)
    return withoutPos(
      next,
      WORLD_AXES.filter((_, k) => Math.abs(after[k]! - before[k]!) > 1e-6),
    )
  }
  const reorient = (inst: Instance, def: PartDef, frame: Frame) => {
    const { doc } = get()
    const next = reoriented(inst, def, frame)
    return commit({ ...doc, instances: doc.instances.map((i) => (i.id === inst.id ? next : i)) })
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
    also: alsoExisting(initial.doc, initial.selection, previousState?.also ?? []),

    toggleSelected: (id) => {
      const { selection, also, doc } = get()
      if (!doc.instances.some((i) => i.id === id)) return
      if (selection?.kind !== 'body') return set({ selection: { kind: 'body', id }, also: [] })
      if (selection.id === id) {
        const [next, ...rest] = also
        return set(next ? { selection: { kind: 'body', id: next }, also: rest } : { selection: null, also: [] })
      }
      if (also.includes(id)) return set({ also: also.filter((x) => x !== id) })
      set({ selection: { kind: 'body', id }, also: [selection.id, ...also] })
    },

    selectBodies: (ids) => {
      const existing = new Set(get().doc.instances.map((i) => i.id))
      const list = [...new Set(ids)].filter((id) => existing.has(id))
      const last = list.at(-1)
      set(last ? { selection: { kind: 'body', id: last }, also: list.slice(0, -1) } : { selection: null, also: [] })
    },

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
      return commit({ ...doc, sketches: [...doc.sketches, sketch] }, { kind: 'sketch', id: sketch.id })
        ? sketch.id
        : null
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
        { defId: newId(), instanceId: newId(), name, material: DEFAULT_MATERIAL },
        depthExpr,
      )
      if (!part) return null
      const instance = combine ? { ...part.instance, combine } : part.instance
      const ok = commit(
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
      return ok ? instance.id : null
    },

    pushPullBody: (instanceId, face, distance, dim) => {
      const found = findInstance(instanceId)
      const next = found && pushPullBody(found.def, face, distance)
      if (!next) return false
      // Handpåläggning vinner: axeln slutar styras av sitt uttryck, om man inte skrev ett nytt.
      const rest = withoutAxis(next.dims, faceAxis(face), next)
      const def = withDims(next, dim ? { ...rest, [faceAxis(face)]: dim } : rest)
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
      return commit({ ...doc, instances }, { kind: 'body', id: instanceId, face })
    },

    moveInstance: (instanceId, delta) => get().moveInstances([instanceId], delta),

    moveInstances: (ids, delta) => {
      const { doc } = get()
      const moving = new Set(ids)
      commit({
        ...doc,
        instances: doc.instances.map((i) =>
          moving.has(i.id)
            ? withoutPos(
                { ...i, frame: { ...i.frame, origin: add(i.frame.origin, delta) } },
                WORLD_AXES.filter((_, k) => delta[k] !== 0),
              )
            : i,
        ),
      })
    },

    rotateInstance: (instanceId, center, axis, degrees) => get().rotateInstances([instanceId], center, axis, degrees),

    rotateInstances: (ids, center, axis, degrees) => {
      if (degrees % 360 === 0) return
      const { doc } = get()
      const turning = new Set(ids)
      const defs = new Map(doc.defs.map((d) => [d.id, d]))
      let changed = false
      const instances = doc.instances.map((i) => {
        const def = defs.get(i.defId)
        if (!turning.has(i.id) || !def) return i
        changed = true
        return reoriented(i, def, rotateFrame(i.frame, center, axis, degrees))
      })
      if (changed) commit({ ...doc, instances })
    },

    copyInstances: (ids, transform) => {
      const { doc } = get()
      const copies = ids.flatMap((id) => {
        const inst = doc.instances.find((i) => i.id === id)
        // Kopiorna räknar sina vinklar från samma viloläge som originalen.
        return inst ? [{ id: newId(), defId: inst.defId, frame: transform(inst.frame), rest: restOf(inst) }] : []
      })
      const last = copies.at(-1)
      if (!last) return []
      const ok = commit(
        { ...doc, instances: [...doc.instances, ...copies] },
        { kind: 'body', id: last.id },
        copies.slice(0, -1).map((c) => c.id),
      )
      return ok ? copies.map((c) => c.id) : []
    },

    duplicateSelection: () => {
      const ids = selectedBodyIds(get())
      if (ids.length <= 1) {
        if (ids[0]) get().duplicateLinked(ids[0])
        return
      }
      const chosen = new Set(ids)
      const bodies = resolveBodies(get().doc).filter((b) => chosen.has(b.id))
      if (bodies.length === 0) return
      const box = bodiesBox(bodies)
      const offset: Vec3 = [box.max[0] - box.min[0] + DUPLICATE_GAP, 0, 0]
      get().copyInstances(
        bodies.map((b) => b.id),
        (f) => ({ ...f, origin: add(f.origin, offset) }),
      )
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
      return reorient(inst, def, withAngles(inst.frame, rest, bodyCenter(body), angles)) ? null : LIMIT_REFUSED
    },

    addCopies: (sourceId, frames) => {
      const found = findInstance(sourceId)
      if (!found || frames.length === 0) return []
      // Kopiorna räknar sina vinklar från samma viloläge som originalet.
      const rest = restOf(found.inst)
      const copies = frames.map((frame) => ({ id: newId(), defId: found.def.id, frame, rest }))
      const { doc } = get()
      const ok = commit({ ...doc, instances: [...doc.instances, ...copies] }, { kind: 'body', id: copies.at(-1)!.id })
      return ok ? copies.map((c) => c.id) : []
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
      return commit({ ...doc, instances: [...doc.instances, copy] }, { kind: 'body', id: copy.id }) ? copy.id : null
    },

    makeUnique: (instanceId) => {
      const found = findInstance(instanceId)
      if (!found) return
      const { doc } = get()
      const def: PartDef = { ...found.def, id: newId(), name: uniqueCopyName(doc.defs, found.def.name) }
      commit({
        ...doc,
        defs: [...doc.defs, def],
        instances: doc.instances.map((i) => (i.id === instanceId ? { ...i, defId: def.id } : i)),
      })
    },

    updatePart: (instanceId, patch) => get().updateParts([instanceId], patch),

    updateParts: (ids, patch) => {
      const { doc } = get()
      // Länkade kopior delar form: varje form ändras en gång.
      const defIds = new Set(doc.instances.filter((i) => ids.includes(i.id)).map((i) => i.defId))
      let next = doc
      for (const old of doc.defs) {
        if (!defIds.has(old.id) || Object.entries(patch).every(([k, v]) => old[k as keyof PartDef] === v)) continue
        // Fiber och tjocklek måste ligga på olika axlar; withAxes löser krockar.
        const def = { ...old, ...patch, ...withAxes(old, patch) }
        // paint: undefined tar bort färgen; nyckeln ska inte ligga kvar i dokumentet.
        if (def.paint === undefined) delete def.paint
        next = replaceDef(next, def)
      }
      if (next !== doc) commit(next)
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
      return commit(replaceDef(doc, withDims(resized, dims))) ? null : LIMIT_REFUSED
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
      return commit({ ...doc, instances: doc.instances.map((i) => (i.id === instanceId ? inst : i)) })
        ? null
        : LIMIT_REFUSED
    },

    setStockSizes: (key, list) => {
      const { doc } = get()
      const { [key]: _old, ...others } = doc.stock?.sizes ?? {}
      void _old
      const sizes = list?.length ? { ...others, [key]: list } : others
      commit({ ...doc, stock: { ...doc.stock, sizes } })
    },

    setLeftover: (key, on) => {
      const { doc } = get()
      const others = (doc.stock?.noLeftover ?? []).filter((k) => k !== key)
      const noLeftover = on ? others : [...others, key]
      const { noLeftover: _old, ...rest } = doc.stock ?? {}
      void _old
      commit({ ...doc, stock: noLeftover.length ? { ...rest, noLeftover } : rest })
    },

    setStockOptions: (patch) => {
      const { doc } = get()
      commit({ ...doc, stock: { ...doc.stock, ...patch } })
    },

    addParam: () => {
      const { doc } = get()
      const used = new Set(doc.params.map((p) => p.name))
      let n = 1
      while (used.has(`mått${n}`)) n++
      const param = { id: newId(), name: `mått${n}`, expr: '100', value: 100 }
      return commit({ ...doc, params: [...doc.params, param] }) ? param.id : null
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

      if (next !== doc && !commit(next)) return LIMIT_REFUSED
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
      const { doc, selection, also } = get()
      if (!selection) return
      if (selection.kind === 'body' && also.length > 0) {
        // Flera delar: var och en tar sina verktyg och tvillingar med sig, och inget är valt efteråt.
        const ids = [selection.id, ...also]
        const gone = new Set(ids.flatMap((id) => [id, ...jointTwins(doc, id).map((t) => t.id)]))
        commit(
          {
            ...doc,
            instances: doc.instances.filter((i) => !gone.has(i.id) && !(i.combine && gone.has(i.combine.host))),
          },
          null,
        )
        return
      }
      // Ett verktyg: delen det satt på blir vald, så att man är kvar där man arbetade.
      const host = selection.kind === 'body' && doc.instances.find((i) => i.id === selection.id)?.combine?.host
      // En tapp tar sina tvillingar med sig: på de länkade benen är de samma tapp.
      const gone = new Set(
        selection.kind === 'body' ? [selection.id, ...jointTwins(doc, selection.id).map((t) => t.id)] : [],
      )
      commit(
        selection.kind === 'body'
          ? {
              ...doc,
              instances: doc.instances.filter((i) => !gone.has(i.id) && i.combine?.host !== selection.id),
            }
          : { ...doc, sketches: doc.sketches.filter((s) => s.id !== selection.id) },
        host ? { kind: 'body', id: host } : null,
      )
    },

    combine: (toolId, op, hostId) => {
      const { doc } = get()
      const error = combineError(doc, toolId, hostId)
      if (error) return error
      const ok = commit(
        {
          ...doc,
          instances: doc.instances.map((i) => (i.id === toolId ? { ...i, combine: { op, host: hostId } } : i)),
        },
        { kind: 'body', id: hostId },
      )
      return ok ? null : LIMIT_REFUSED
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
      // Länkade kopior av värden som ligger an mot samma del på samma sätt (fyra ben under en skiva)
      // får samma tapp, i en grupp: de är en tapp på den delade formen, med ett hål för varje kopia.
      const fits = (t: Exclude<ReturnType<typeof tenonFor>, string>, b: Body) =>
        JSON.stringify(roundedTenon(t, b)) === JSON.stringify(roundedTenon(tenon, host))
      const pairs = [
        { host, tenon },
        ...bodies.flatMap((b) => {
          if (b.id === hostId || b.defId !== host.defId || jointError(doc, b.id, intoId)) return []
          const t = tenonFor(b, into)
          return typeof t !== 'string' && fits(t, b) ? [{ host: b, tenon: t }] : []
        }),
      ]
      const group = pairs.length > 1 ? newId() : undefined
      const name = nextPartName(doc.defs, 'Tapp')
      const defs: PartDef[] = []
      const instances: Instance[] = []
      for (const p of pairs) {
        const box = {
          profile: p.tenon.profile,
          ...(p.tenon.shape && { shape: p.tenon.shape }),
          z0: 0,
          z1: p.tenon.depth,
        }
        const def: PartDef = { id: newId(), name, material: host.material, ...defaultAxes(box), ...box }
        defs.push(def)
        instances.push({
          id: newId(),
          defId: def.id,
          frame: p.tenon.frame,
          combine: { op: 'joint', host: p.host.id, into: intoId, ...(group && { group }) },
        })
      }
      const ok = commit(
        { ...doc, defs: [...doc.defs, ...defs], instances: [...doc.instances, ...instances] },
        { kind: 'body', id: hostId },
      )
      return ok ? null : LIMIT_REFUSED
    },

    detach: (toolId) => {
      const { doc } = get()
      if (!doc.instances.some((i) => i.id === toolId && i.combine)) return
      // En tapp lossas med sina tvillingar, som när den tas bort.
      const loose = new Set([toolId, ...jointTwins(doc, toolId).map((t) => t.id)])
      commit(
        {
          ...doc,
          instances: doc.instances.map((i) => {
            if (!loose.has(i.id)) return i
            const { combine: _gone, ...rest } = i
            void _gone
            return rest
          }),
        },
        { kind: 'body', id: toolId },
      )
    },

    select: (selection) => set({ selection, also: [] }),

    clearDocument: () => commit(emptyDocument(), null),

    load: (doc) => set({ doc: applyParams(doc), selection: null, also: [], past: [], future: [] }),

    refreshMaterials: () => {
      const { doc } = get()
      const next = embedMaterials(doc)
      if (next !== doc) set({ doc: next })
    },

    setHistory: (past, future) => set({ past: past.slice(-HISTORY_LIMIT), future }),

    // Valet blir det som var valt i det läget, så att man kan fortsätta där man var
    // (ångrar man en utdragning är skissen vald igen). Finns det inte längre, det nuvarande.
    undo: () => {
      const { doc, past, future, selection } = get()
      const prev = past.at(-1)
      if (!prev) return
      set({
        doc: prev.doc,
        past: past.slice(0, -1),
        future: [{ doc, selection }, ...future],
        selection: selectionExists(prev.doc, prev.selection) ?? selectionExists(prev.doc, selection),
        also: [],
      })
    },

    redo: () => {
      const { doc, past, future, selection } = get()
      const next = future[0]
      if (!next) return
      set({
        doc: next.doc,
        past: [...past, { doc, selection }],
        future: future.slice(1),
        selection: selectionExists(next.doc, next.selection) ?? selectionExists(next.doc, selection),
        also: [],
      })
    },
  }
})

if (import.meta.hot) import.meta.hot.data.documentStore = useDocumentStore

/** Alla kopior ihopslagna med sina former. Stabil referens per dokument. */
export const useBodies = () => useDocumentStore((s) => resolveBodies(s.doc))

/** Endast för tester. */
export function resetDocumentStore() {
  useDocumentStore.setState({ ...emptySnapshot(), also: [] })
}
