import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react-dom'
import { Check, Delete, Keyboard } from 'lucide-react'
import { useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** En tangent: text som sätts in, eller en åtgärd. */
/** Tangentens färg, som i miniräknaren i iOS: siffror, räknesätt, funktioner (översta raden) och OK. */
type Tone = 'digit' | 'op' | 'fn' | 'ok'

/** En tangent: text som sätts in, eller en åtgärd. */
type Key = { label: ReactNode; aria?: string; insert?: string; action?: 'back' | 'ok' | 'keyboard'; tone: Tone }

/**
 * Som miniräknaren i iOS: räknesätten i en kolumn till höger med egen färg, OK längst ner
 * där = brukar sitta, och radera och parenteser överst som funktionsrad.
 */
const KEYS: Key[] = [
  { label: <Delete size={20} strokeWidth={1.75} aria-hidden />, aria: 'Radera', action: 'back', tone: 'fn' },
  { label: '(', aria: 'Vänsterparentes', insert: '(', tone: 'fn' },
  { label: ')', aria: 'Högerparentes', insert: ')', tone: 'fn' },
  { label: '÷', aria: 'Delat med', insert: ' / ', tone: 'op' },
  { label: '7', insert: '7', tone: 'digit' },
  { label: '8', insert: '8', tone: 'digit' },
  { label: '9', insert: '9', tone: 'digit' },
  { label: '×', aria: 'Gånger', insert: ' * ', tone: 'op' },
  { label: '4', insert: '4', tone: 'digit' },
  { label: '5', insert: '5', tone: 'digit' },
  { label: '6', insert: '6', tone: 'digit' },
  { label: '−', aria: 'Minus', insert: ' - ', tone: 'op' },
  { label: '1', insert: '1', tone: 'digit' },
  { label: '2', insert: '2', tone: 'digit' },
  { label: '3', insert: '3', tone: 'digit' },
  { label: '+', aria: 'Plus', insert: ' + ', tone: 'op' },
  { label: <Keyboard size={20} strokeWidth={1.75} aria-hidden />, aria: 'Tangentbord', action: 'keyboard', tone: 'fn' },
  { label: '0', insert: '0', tone: 'digit' },
  { label: ',', aria: 'Komma', insert: ',', tone: 'digit' },
  { label: <Check size={20} strokeWidth={2.25} aria-hidden />, aria: 'OK', action: 'ok', tone: 'ok' },
]

interface Props {
  /** Rutan runt fältet (eller fältet); blocket hamnar intill den. */
  anchor: HTMLElement | null
  placement: 'above' | 'below'
  /** Parametrar att sätta in med ett tryck. */
  names: string[]
  onInsert: (text: string) => void
  /** En parameter trycktes (sätts in med mellanslag mot siffror intill, se nameAt). */
  onName: (name: string) => void
  onBackspace: () => void
  onOk: () => void
  /** Byt till systemets tangentbord för fältet (bokstäver, eller om man hellre skriver). */
  onKeyboard: () => void
  /** Ett tryck någonstans i blocket, före tangentens verkan (se ExprInput: fältet behåller fokus). */
  onPress: () => void
}

/**
 * Sifferblock för måtten på pekskärm, som i Shapr3D: i stället för systemets
 * tangentbord, som täcker halva skärmen och kan dölja fältet. Siffror, komma,
 * räknesätt och parenteser, och parametrarnas namn överst. Tangentbordsknappen
 * byter till systemets tangentbord för fältet. Tangenterna tar inte
 * fokus från fältet (onPointerDown förhindras), så att markören står kvar.
 */
export function Numpad({ anchor, placement, names, onInsert, onName, onBackspace, onOk, onKeyboard, onPress }: Props) {
  const {
    refs: { setFloating, setReference },
    floatingStyles,
  } = useFloating({
    placement: placement === 'below' ? 'bottom-start' : 'top-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8, crossAxis: true }), shift({ padding: 8 })],
  })
  useLayoutEffect(() => setReference(anchor), [anchor, setReference])

  const press = (k: Key) => {
    if (k.insert) onInsert(k.insert)
    else if (k.action === 'back') onBackspace()
    else if (k.action === 'keyboard') onKeyboard()
    else onOk()
  }
  const keyClass = 'grid h-12 cursor-pointer place-items-center rounded-lg tabular-nums'
  const colors: Record<Tone, string> = {
    digit: 'bg-button text-lg font-medium text-ink active:bg-hover',
    op: 'bg-accent-soft text-xl font-semibold text-accent active:opacity-80',
    fn: 'bg-ink/15 text-lg text-ink active:bg-ink/25',
    ok: 'bg-accent text-lg text-on-accent active:opacity-90',
  }

  return createPortal(
    <div
      ref={setFloating}
      style={floatingStyles}
      role="group"
      aria-label="Sifferblock"
      // Inget tryck i blocket får ta fokus från fältet. På iPhone och iPad flyttar Safari fokus vid
      // touchend och click, inte vid pointerdown; stoppa alla (de når hit från tangenterna också).
      onPointerDown={(e) => {
        e.preventDefault()
        onPress()
      }}
      onTouchEnd={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      className="z-50 w-64 rounded-xl border border-line bg-panel p-2 shadow-lg"
    >
      {names.length > 0 && (
        <div className="mb-2 flex gap-1 overflow-x-auto">
          {names.map((n) => (
            <button
              key={n}
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => {
                e.preventDefault()
                onName(n)
              }}
              className="h-9 shrink-0 cursor-pointer rounded-md bg-accent-soft px-2 text-[13px] font-medium text-accent"
            >
              {n}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-4 gap-1.5">
        {KEYS.map((k, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            aria-label={k.aria}
            onPointerDown={(e) => {
              e.preventDefault()
              press(k)
            }}
            className={`${keyClass} ${colors[k.tone]}`}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
