import { rotateFrame } from '../model/frame'
import { pushPullBody, sketchToPart } from '../model/geometry'
import type { ModelDocument } from '../model/types'
import { add } from '../model/vec'
import type { Op } from '../store/toolStore'
import { moveDeltaWorld } from './actions'

export interface Preview {
  doc: ModelDocument
  /** Kopior som ändras av operationen; ritas som förhandsvisning. */
  affected: Set<string>
}

/**
 * Dokumentet som det skulle se ut om operationen avslutades nu.
 * Null för rektangel (ritas separat) eller om resultatet är ogiltigt.
 */
export function previewDoc(op: Op, doc: ModelDocument): Preview | null {
  if (op.kind === 'rect') return null

  if (op.kind === 'rotate') {
    const { origin, n } = op.plane
    return {
      doc: {
        ...doc,
        instances: doc.instances.map((i) =>
          i.id === op.instanceId ? { ...i, frame: rotateFrame(i.frame, origin, n, op.angle) } : i,
        ),
      },
      affected: new Set([op.instanceId]),
    }
  }

  if (op.kind === 'move') {
    const delta = moveDeltaWorld(op)
    return {
      doc: {
        ...doc,
        instances: doc.instances.map((i) =>
          i.id === op.instanceId ? { ...i, frame: { ...i.frame, origin: add(i.frame.origin, delta) } } : i,
        ),
      },
      affected: new Set([op.instanceId]),
    }
  }

  const t = op.target
  if (t.kind === 'sketch') {
    const s = doc.sketches.find((x) => x.id === t.id)
    const part =
      s && sketchToPart(s, op.distance, { defId: 'preview', instanceId: 'preview', name: '', material: 'furu' })
    if (!part) return null
    return {
      doc: {
        ...doc,
        sketches: doc.sketches.filter((x) => x.id !== t.id),
        defs: [...doc.defs, part.def],
        instances: [...doc.instances, part.instance],
      },
      affected: new Set(['preview']),
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
