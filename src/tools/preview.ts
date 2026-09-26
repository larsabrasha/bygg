import { sketchCombine } from '../model/combine'
import { pushPullBody, sketchToPart } from '../model/geometry'
import type { ModelDocument } from '../model/types'
import type { Op } from '../store/toolStore'
import { applyStep, stepOf } from './actions'

export interface Preview {
  doc: ModelDocument
  /** Kopior som ändras av operationen; ritas som förhandsvisning. */
  affected: Set<string>
}

/** Id för delen som förhandsvisas när en skiss dras ut. */
export const PREVIEW_ID = 'preview'

/** Id för kopian som förhandsvisas när Kopia är på. */
export const COPY_PREVIEW_ID = 'preview-copy'

/**
 * Dokumentet som det skulle se ut om operationen avslutades nu.
 * Null för rektangel (ritas separat) eller om resultatet är ogiltigt.
 * copy = Flytta-lägets Kopia är på.
 */
export function previewDoc(op: Op, doc: ModelDocument, copy = false): Preview | null {
  if (op.kind === 'rect') return null

  if (op.kind === 'move' || op.kind === 'rotate') {
    const step = stepOf(op)
    const src = doc.instances.find((i) => i.id === op.instanceId)
    if (!src) return null
    // Utan rörelse visas delen som den är, men halvgenomskinlig så att man ser vad man tagit i.
    const moved = { ...src, frame: step ? applyStep(src.frame, step, 1) : src.frame }
    // Med Kopia står originalet kvar och kopian visas där den hamnar.
    if (copy) {
      const ghost = { ...moved, id: COPY_PREVIEW_ID }
      return { doc: { ...doc, instances: [...doc.instances, ghost] }, affected: new Set([COPY_PREVIEW_ID]) }
    }
    return {
      doc: { ...doc, instances: doc.instances.map((i) => (i.id === src.id ? moved : i)) },
      affected: new Set([src.id]),
    }
  }

  const t = op.target
  if (t.kind === 'sketch') {
    const s = doc.sketches.find((x) => x.id === t.id)
    const part =
      s && sketchToPart(s, op.distance, { defId: PREVIEW_ID, instanceId: PREVIEW_ID, name: '', material: 'furu' })
    if (!part) return null
    // På en del: urtaget eller tillägget syns i delen medan man drar.
    const combine = sketchCombine(doc, s, op.distance, op.mode)
    if (combine) part.instance.combine = combine
    return {
      doc: {
        ...doc,
        sketches: doc.sketches.filter((x) => x.id !== t.id),
        defs: [...doc.defs, part.def],
        instances: [...doc.instances, part.instance],
      },
      affected: new Set([PREVIEW_ID]),
    }
  }

  const inst = doc.instances.find((i) => i.id === t.id)
  const def = inst && doc.defs.find((d) => d.id === inst.defId)
  const next = def && pushPullBody(def, t.face, op.distance)
  if (!next) return null
  return {
    doc: { ...doc, defs: doc.defs.map((d) => (d.id === next.id ? next : d)) },
    affected: new Set(doc.instances.filter((i) => i.defId === next.id).map((i) => i.id)),
  }
}
