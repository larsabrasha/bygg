import { create, type StoreApi } from 'zustand'
import { nextBodyName, pushPullBody, sketchToBody, isValidRect } from '../model/geometry'
import { newId } from '../model/id'
import type { Body, Face, Frame, ModelDocument, Rect } from '../model/types'

export type Selection = { kind: 'body' | 'sketch'; id: string }

interface Snapshot {
  doc: ModelDocument
  selection: Selection | null
  past: ModelDocument[]
  future: ModelDocument[]
}

export type BodyPatch = Partial<Pick<Body, 'name' | 'material' | 'grain'>>

interface DocumentState extends Snapshot {
  /** Returnerar skissens id, eller null om rektangeln är för liten. */
  addSketch: (frame: Frame, rect: Rect) => string | null
  /** Drar ut en skiss till en ny kropp. Skissen försvinner. Returnerar kroppens id. */
  pushPullSketch: (sketchId: string, distance: number) => string | null
  /** Flyttar en sida på en kropp. False om resultatet blir ogiltigt. */
  pushPullBody: (bodyId: string, face: Face, distance: number) => boolean
  updateBody: (bodyId: string, patch: BodyPatch) => void
  deleteSelection: () => void
  select: (selection: Selection | null) => void
  undo: () => void
  redo: () => void
}

const HISTORY_LIMIT = 100

const emptySnapshot = (): Snapshot => ({ doc: { sketches: [], bodies: [] }, selection: null, past: [], future: [] })

function selectionExists(doc: ModelDocument, sel: Selection | null): Selection | null {
  if (!sel) return null
  const list = sel.kind === 'body' ? doc.bodies : doc.sketches
  return list.some((x) => x.id === sel.id) ? sel : null
}

// Vid HMR körs modulen om och en ny store skapas. Dokumentet tas då över
// från förra storen, så att nya actions laddas in men datan ligger kvar.
// (hot.dispose räcker inte: Vite anropar den bara för moduler som själva
// accepterar uppdateringen, och här är det komponenterna som gör det.)
const previous = import.meta.hot?.data.documentStore as StoreApi<DocumentState> | undefined
const initial: Snapshot = previous
  ? (({ doc, selection, past, future }) => ({ doc, selection, past, future }))(previous.getState())
  : emptySnapshot()

export const useDocumentStore = create<DocumentState>()((set, get) => {
  /** Sparar nuvarande dokument i historiken och byter till next. */
  const commit = (next: ModelDocument, selection: Selection | null) => {
    const { doc, past } = get()
    set({ doc: next, selection, past: [...past, doc].slice(-HISTORY_LIMIT), future: [] })
  }

  return {
    ...initial,

    addSketch: (frame, rect) => {
      if (!isValidRect(rect)) return null
      const { doc } = get()
      const sketch = { id: newId(), frame, rect }
      commit({ ...doc, sketches: [...doc.sketches, sketch] }, { kind: 'sketch', id: sketch.id })
      return sketch.id
    },

    pushPullSketch: (sketchId, distance) => {
      const { doc } = get()
      const sketch = doc.sketches.find((s) => s.id === sketchId)
      if (!sketch) return null
      const body = sketchToBody(sketch, distance, {
        id: newId(),
        name: nextBodyName(doc.bodies),
        material: 'furu',
        grain: 'length',
      })
      if (!body) return null
      commit(
        { sketches: doc.sketches.filter((s) => s.id !== sketchId), bodies: [...doc.bodies, body] },
        { kind: 'body', id: body.id },
      )
      return body.id
    },

    pushPullBody: (bodyId, face, distance) => {
      const { doc } = get()
      const body = doc.bodies.find((b) => b.id === bodyId)
      const next = body && pushPullBody(body, face, distance)
      if (!next) return false
      commit({ ...doc, bodies: doc.bodies.map((b) => (b.id === bodyId ? next : b)) }, { kind: 'body', id: bodyId })
      return true
    },

    updateBody: (bodyId, patch) => {
      const { doc, selection } = get()
      const body = doc.bodies.find((b) => b.id === bodyId)
      if (!body || Object.entries(patch).every(([k, v]) => body[k as keyof Body] === v)) return
      commit({ ...doc, bodies: doc.bodies.map((b) => (b.id === bodyId ? { ...b, ...patch } : b)) }, selection)
    },

    deleteSelection: () => {
      const { doc, selection } = get()
      if (!selection) return
      commit(
        selection.kind === 'body'
          ? { ...doc, bodies: doc.bodies.filter((b) => b.id !== selection.id) }
          : { ...doc, sketches: doc.sketches.filter((s) => s.id !== selection.id) },
        null,
      )
    },

    select: (selection) => set({ selection }),

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

/** Endast för tester. */
export function resetDocumentStore() {
  useDocumentStore.setState(emptySnapshot())
}
