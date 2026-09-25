import { pushPullBody, sketchToBody } from '../model/geometry'
import type { Body, ModelDocument } from '../model/types'
import type { PushPullOp } from '../store/toolStore'

/** Resultatet av en pågående push/pull, eller null om det inte är giltigt (t.ex. avstånd 0). */
export function pushPullPreview(op: PushPullOp, doc: ModelDocument): Body | null {
  const t = op.target
  if (t.kind === 'sketch') {
    const s = doc.sketches.find((x) => x.id === t.id)
    return s ? sketchToBody(s, op.distance, { id: 'preview', name: '', material: 'furu', grain: 'length' }) : null
  }
  const b = doc.bodies.find((x) => x.id === t.id)
  return b ? pushPullBody(b, t.face, op.distance) : null
}

