import { SKETCH_MODES, type ChosenSketchMode } from '../../panel/measureModel'
import { NUMPAD_KEYS, type NumpadKey } from '../../panel/numpadKeys'
import type { Tool } from '../../store/toolStore'

/**
 * Menyn på vänster hand i VR: verktygen, och under en operation måttet och
 * ett sifferblock. Ren layout (i meter, origo mitt på nederkanten, y uppåt),
 * så att den går att testa; VrMenu ritar den och menuActions gör det knapparna betyder.
 */

export type MenuAction =
  | { kind: 'tool'; tool: Tool }
  | { kind: 'key'; insert: string }
  | { kind: 'name'; name: string }
  | { kind: 'mode'; mode: ChosenSketchMode }
  | { kind: 'repeat' }
  | { kind: 'back' }
  | { kind: 'ok' }
  | { kind: 'cancel' }
  | { kind: 'field'; field: 0 | 1 }

export type Tone =
  'tool' | 'toolActive' | 'digit' | 'op' | 'fn' | 'ok' | 'name' | 'field' | 'fieldActive' | 'hint' | 'panel'

/** Ikonerna, samma som i 3D-vyns verktygsrad och sifferblock (se menuIcons). */
export type MenuIcon = 'select' | 'rect' | 'circle' | 'move' | 'measure' | 'back' | 'ok' | 'cancel'

export interface MenuItem {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  tone: Tone
  /** Ritas i stället för texten; texten är då bara ett namn (för tester och felsökning). */
  icon?: MenuIcon
  /** Saknas för det som bara visar något (hjälptext, bakgrund). */
  action?: MenuAction
}

export interface MeasureInfo {
  hint: string
  fields: { label: string; value: string; unit: string }[]
  /** Fältet man skriver i, när det finns två (rektangel). */
  active: 0 | 1
  /** Parametrarnas namn, att sätta in med ett tryck (som överst i sifferblocket i 3D-vyn). */
  names: string[]
  /** Som förra i måttrutan: texten med förra måttet, eller null när det inte går. */
  repeat: string | null
  /** En skiss på en del: vad den blir (se SKETCH_MODES), eller null. */
  mode: string | null
}

export interface MenuState {
  tool: Tool
  /** Måttet och sifferblocket, när något pågår eller är valt; annars null. */
  measure: MeasureInfo | null
  /** Text utan sifferblock: avståndet i Mät, eller verktygets hjälptext när inget pågår. */
  note: string | null
}

const TOOLS: { tool: Tool; label: string; icon: MenuIcon }[] = [
  { tool: 'select', label: 'Välj', icon: 'select' },
  { tool: 'rect', label: 'Rektangel', icon: 'rect' },
  { tool: 'circle', label: 'Cirkel', icon: 'circle' },
  // Finns inte i verktygsraden i 3D-vyn (dit kommer man med dubbeltryck eller M); här behövs en knapp.
  { tool: 'move', label: 'Flytta', icon: 'move' },
  { tool: 'measure', label: 'Mät', icon: 'measure' },
]

/**
 * En tangent i sifferblocket (NUMPAD_KEYS, samma som i 3D-vyn). Tangentbordet
 * finns inte i VR; på dess plats sitter Avbryt, som i måttrutan ligger bredvid.
 */
function vrKey(k: NumpadKey): Omit<MenuItem, 'x' | 'y' | 'w' | 'h'> {
  if (k.action === 'keyboard')
    return { id: 'key-cancel', label: 'Avbryt', icon: 'cancel', tone: 'fn', action: { kind: 'cancel' } }
  const action: MenuAction = k.insert
    ? { kind: 'key', insert: k.insert }
    : k.action === 'back'
      ? { kind: 'back' }
      : { kind: 'ok' }
  return {
    id: `key-${k.label}`,
    label: k.label,
    icon: k.icon === 'keyboard' ? undefined : k.icon,
    tone: k.tone,
    action,
  }
}

/** Parametrar som får plats på raden över sifferblocket. */
const MAX_NAMES = 4

/** Menyns bredd i meter. */
export const MENU_W = 0.18
const GAP = 0.004
const PAD = 0.006
const TOOL_H = 0.03
const KEY_H = 0.032
const FIELD_H = 0.03
const NAME_H = 0.024
const HINT_H = 0.026

export function menuLayout(state: MenuState): MenuItem[] {
  const items: MenuItem[] = []
  const inner = MENU_W - PAD * 2
  const left = -MENU_W / 2 + PAD
  let y = PAD

  // En rad (nerifrån): celler lika breda, med mellanrum.
  const row = (h: number, cells: Omit<MenuItem, 'x' | 'y' | 'w' | 'h'>[]) => {
    const w = (inner - GAP * (cells.length - 1)) / cells.length
    cells.forEach((c, i) => items.push({ ...c, x: left + w / 2 + i * (w + GAP), y: y + h / 2, w, h }))
    y += h + GAP
  }

  // Nederst, närmast handen: verktygen, i samma ordning som verktygsraden i 3D-vyn. Ångra och
  // gör om finns inte här: de ligger på A och B på kontrollen, och knapparna var lätta att råka trycka på.
  row(
    TOOL_H,
    TOOLS.map(({ tool, label, icon }) => ({
      id: `tool-${tool}`,
      label,
      icon,
      tone: state.tool === tool ? 'toolActive' : 'tool',
      action: { kind: 'tool', tool },
    })),
  )

  if (state.note) row(HINT_H * 1.5, [{ id: 'note', label: state.note, tone: 'hint' }])

  const m = state.measure
  if (m) {
    // Extra luft mellan verktygen och sifferblocket, så att man inte byter verktyg när man siktar på en siffra.
    y += GAP * 2
    // Raderna nerifrån: NUMPAD_KEYS är uppifrån, fyra per rad.
    for (let i = NUMPAD_KEYS.length - 4; i >= 0; i -= 4) row(KEY_H, NUMPAD_KEYS.slice(i, i + 4).map(vrKey))
    if (m.names.length > 0)
      row(
        NAME_H,
        m.names.slice(0, MAX_NAMES).map((name) => ({
          id: `name-${name}`,
          label: name,
          tone: 'name',
          action: { kind: 'name', name },
        })),
      )
    row(
      FIELD_H,
      m.fields.map((f, i) => ({
        id: `field-${i}`,
        label: `${f.label}  ${f.value} ${f.unit}`,
        tone: m.fields.length > 1 && m.active === i ? 'fieldActive' : 'field',
        action: { kind: 'field', field: i as 0 | 1 },
      })),
    )
    // Ovanför fältet, som i måttrutan: Som förra, och vad en skiss på en del blir.
    if (m.repeat) row(TOOL_H, [{ id: 'repeat', label: m.repeat, tone: 'tool', action: { kind: 'repeat' } }])
    if (m.mode)
      row(
        TOOL_H,
        SKETCH_MODES.map(([mode, label]) => ({
          id: `mode-${mode}`,
          label,
          tone: m.mode === mode ? 'toolActive' : 'tool',
          action: { kind: 'mode', mode },
        })),
      )
    if (m.hint) row(HINT_H * 1.5, [{ id: 'hint', label: m.hint, tone: 'hint' }])
  }

  // Bakgrunden bakom allt, lika hög som innehållet.
  const height = y - GAP + PAD
  items.unshift({ id: 'panel', label: '', x: 0, y: height / 2, w: MENU_W, h: height, tone: 'panel' })
  return items
}

/**
 * Texten i ett fält efter en tangent (insert som i NUMPAD_KEYS). I ett tomt
 * fält blir minus ett negativt tal, och övriga räknesätt görs inget med.
 */
export function applyKey(text: string, insert: string): string {
  if (text.trim() === '' && insert.trim() !== insert) return insert.trim() === '-' ? '-' : text
  return text + insert
}

/** Texten efter radera: sista tecknet, eller ett räknesätt med mellanrummen runt det. */
export function backspace(text: string): string {
  return / [-+*/] $/.test(text) ? text.slice(0, -3) : text.slice(0, -1)
}
