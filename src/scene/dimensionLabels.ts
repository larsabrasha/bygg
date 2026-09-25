import { faceAxis } from '../model/geometry'
import { resolveBodies } from '../model/resolve'
import type { Axis, Body, ModelDocument, PartDef } from '../model/types'
import type { Selection } from '../store/documentStore'
import type { Op, Tool } from '../store/toolStore'
import { PREVIEW_ID, previewDoc } from '../tools/preview'
import type { Segment } from './labelPlacement'

/**
 * Måtten på den valda delen visas som vanliga HTML-element ovanpå 3D-vyn
 * (panel/DimensionLabels). Scenen (DimensionGuides) placerar dem varje
 * bildruta. Här möts de: elementen per axel, och ett sätt att be om en bildruta.
 */
export const labelElements = new Map<Axis, HTMLElement>()
/**
 * Etiketternas storlek i px, så att scenen inte behöver mäta dem varje
 * bildruta (det tvingar webbläsaren att räkna om layouten mitt i bildrutan).
 */
export const labelSizes = new Map<Axis, [number, number]>()

let wake: (() => void) | null = null

/**
 * Pilen för push/pull på skärmen (PushPullHandle skriver den varje bildruta),
 * så att etiketterna kan ställa sig bredvid den i stället för under den.
 */
let arrow: Segment | null = null

export const arrowOnScreen = () => arrow

/** Ändras pilen behövs en bildruta till, så att etiketterna flyttas efter den. */
export function setArrowOnScreen(next: Segment | null) {
  const same =
    arrow === next ||
    (!!arrow &&
      !!next &&
      Math.abs(arrow.a[0] - next.a[0]) + Math.abs(arrow.a[1] - next.a[1]) < 0.5 &&
      Math.abs(arrow.b[0] - next.b[0]) + Math.abs(arrow.b[1] - next.b[1]) < 0.5)
  arrow = next
  if (!same) wake?.()
}

export function setDimensionWake(fn: (() => void) | null) {
  wake = fn
}

const axisOf = new WeakMap<Element, Axis>()
const resizes =
  typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver((entries) => {
        for (const e of entries) {
          const axis = axisOf.get(e.target)
          const box = e.borderBoxSize[0]
          if (axis && box) labelSizes.set(axis, [box.inlineSize, box.blockSize])
        }
        wake?.()
      })

export function registerLabel(axis: Axis, el: HTMLElement | null) {
  const old = labelElements.get(axis)
  if (old && old !== el) {
    resizes?.unobserve(old)
    labelElements.delete(axis)
    labelSizes.delete(axis)
  }
  if (el && el !== old) {
    labelElements.set(axis, el)
    axisOf.set(el, axis)
    resizes?.observe(el)
  }
  wake?.()
}

/** Delen vars mått visas, och om de går att ändra. */
export interface DimensionTarget {
  body: Body
  def: PartDef
  /**
   * Under push/pull: måtten visar delen som den blir och går inte att ändra
   * (man skriver avståndet i måttrutan). changing är axeln som ändras.
   */
  live: boolean
  changing: Axis | null
}

/**
 * Den valda delen i Välj när inget annat pågår, eller delen som växer under
 * push/pull (också en ny del från en skiss), så att man ser det slutliga måttet.
 */
export function dimensionsFor(
  doc: ModelDocument,
  selection: Selection | null,
  tool: Tool,
  op: Op | null,
): DimensionTarget | null {
  const find = (d: ModelDocument, id: string) => {
    const body = resolveBodies(d).find((b) => b.id === id)
    const def = body && d.defs.find((x) => x.id === body.defId)
    return body && def ? { body, def } : null
  }
  if (op?.kind === 'pushpull') {
    const preview = previewDoc(op, doc)
    const t = op.target
    const found = preview && find(preview.doc, t.kind === 'body' ? t.id : PREVIEW_ID)
    return found ? { ...found, live: true, changing: t.kind === 'body' ? faceAxis(t.face) : 'n' } : null
  }
  if (op || tool !== 'select' || selection?.kind !== 'body') return null
  const found = find(doc, selection.id)
  return found ? { ...found, live: false, changing: null } : null
}
