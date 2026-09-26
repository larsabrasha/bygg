import type { Object3D } from 'three'
import { create } from 'zustand'
import { numberFormat } from '../../model/numberFormat'
import { rulerResult } from '../../model/ruler'
import { measureModel, submitMeasure, typeMeasure } from '../../panel/measureModel'
import { nameAt } from '../../panel/numpadEdit'
import { useDocumentStore } from '../../store/documentStore'
import { useToolStore } from '../../store/toolStore'
import { cancel, undoLast } from '../../tools/actions'
import { applyKey, backspace, type MenuAction, type MenuState } from './menuLayout'

/** Vad VR-menyns knappar gör och visar (se VrMenu för hur den ritas). */

const fmt = numberFormat(1)

/** Knappen strålen pekar på (VrRig sätter den), så att den lyser upp. */
export const useVrHover = create<{ id: string | null; set: (id: string | null) => void }>()((set) => ({
  id: null,
  set: (id) => set({ id }),
}))

/** Det en knapp i menyn har i userData, så att strålen (VrRig) kan trycka på den. */
export interface VrUi {
  id: string
  action: MenuAction
}

/** Menyns knappar under group: det strålen kan träffa. */
export function uiTargets(group: Object3D | null): Object3D[] {
  const out: Object3D[] = []
  group?.traverse((o) => {
    if (o.userData.vrUi) out.push(o)
  })
  return out
}

/** Vad en knapp gör. Samma verkan som motsvarande knapp i 3D-vyn och måttrutan. */
export function runMenuAction(action: MenuAction) {
  const t = useToolStore.getState()
  const docs = useDocumentStore.getState()
  const field = t.measureField
  switch (action.kind) {
    case 'tool':
      t.setTool(action.tool)
      return
    case 'key':
      typeMeasure(field, applyKey(t.measure[field], action.insert))
      return
    case 'name': {
      // Som i sifferblocket i 3D-vyn: mellanslag mot en siffra eller ett namn intill.
      const text = t.measure[field]
      typeMeasure(field, nameAt(text, text.length, text.length, action.name).text)
      return
    }
    case 'back':
      if (t.measure[field] !== '') typeMeasure(field, backspace(t.measure[field]))
      return
    case 'ok':
      submitMeasure()
      return
    case 'cancel': {
      // Som krysset i måttrutan: avbryt det som pågår, ångra det som nyss gjordes, annars avmarkera.
      const { amend } = measureModel()
      if (t.op) cancel()
      else if (amend) undoLast()
      else docs.select(null)
      t.setMeasure(0, '')
      t.setMeasure(1, '')
      return
    }
    case 'field':
      t.setMeasureField(action.field)
      return
  }
}

/** Menyns innehåll just nu, ur storarna. */
export function menuState(): MenuState {
  const t = useToolStore.getState()
  if (t.tool === 'measure') {
    const [a, b] = t.ruler.length === 2 ? t.ruler : [t.ruler[0], t.rulerHover]
    const r = a && b ? rulerResult(a, b) : null
    return {
      tool: t.tool,
      measure: null,
      note: r
        ? `${r.kind === 'planes' ? 'Mellan ytorna' : 'Avstånd'} ${fmt.format(r.distance)} mm`
        : t.ruler.length === 0
          ? 'Tryck på en punkt eller yta.'
          : 'Tryck på nästa punkt eller yta.',
    }
  }
  const m = measureModel()
  const open = m.visible && (m.shown || m.extending || m.ready)
  return {
    tool: t.tool,
    note: open ? null : m.hint || null,
    measure: open
      ? {
          hint: m.total !== null ? `= ${fmt.format(m.total)} mm` : m.hint,
          fields: m.fields.map((f, i) => ({
            label: f.label,
            value: t.measure[i] || fmt.format(m.live[i] ?? 0),
            unit: m.unit,
          })),
          active: t.measureField,
          names: useDocumentStore.getState().doc.params.map((p) => p.name),
        }
      : null,
  }
}
