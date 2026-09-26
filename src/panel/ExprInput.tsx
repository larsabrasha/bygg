import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/react-dom'
import { useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useDocumentStore } from '../store/documentStore'
import { insertName, segments, suggestions, wordAt } from './paramSuggest'
import { arrowStep, stepText } from './numberStep'
import { numberFormat } from '../model/numberFormat'
import { useSelectAll } from './useSelectAll'
import { Numpad } from './Numpad'
import { useNumpadStore } from './numpadStore'
import { backspaceAt, insertAt, nameAt, type Edit } from './numpadEdit'
import { useCoarsePointer } from './useCoarsePointer'

const fmt = numberFormat(2)

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (text: string) => void
  /** Listan öppnas under fältet, eller ovanför (måttrutan längst ner i vyn). */
  placement?: 'below' | 'above'
  /** Visa parameternamnen som badges när fältet inte har fokus. */
  badges?: boolean
  /** Fältets vänstra utfyllnad, så att badges hamnar där texten står. */
  padX?: string
  /** Parameter som inte ska föreslås, t.ex. den man redigerar. */
  exclude?: string
  wrapperClass?: string
  /**
   * Efter ett steg med piltangenterna, med den nya texten. Fält som sparar vid
   * Enter sparar här direkt, så att steget syns i 3D-vyn.
   */
  onStep?: (text: string) => void
  /**
   * Värdet som fältet fylls med när det får fokus tomt (måttrutan, där nuvarande mått
   * annars bara är en platshållare), med allt markerat: då går det att ändra det, inte
   * bara skriva ett nytt. onFill tar emot det (inte onChange, som räknas som en ändring).
   */
  fillOnFocus?: string
  onFill?: (text: string) => void
}

/**
 * Textfält för mått och uttryck. Medan man skriver föreslås parametrar
 * (piltangenter och Enter/Tab, eller tryck); valet ersätter ordet vid markören, eller det markerade.
 * Utan fokus visas parameternamnen som badges ovanpå texten.
 *
 * När fältet får fokus markeras allt, så att det man skriver ersätter värdet;
 * ett klick till sätter markören. Är värdet ett rent tal ändrar pil upp och
 * ned det med 1 (Shift 10, Alt 0,1). Ett tomt fält stegar från platshållaren.
 */
export function ExprInput({
  value,
  onChange,
  placement = 'below',
  badges = false,
  padX = 'px-2.5',
  exclude,
  wrapperClass = 'block w-full',
  onStep,
  fillOnFocus,
  onFill,
  className = '',
  onKeyDown,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const params = useDocumentStore((s) => s.doc.params)
  const ref = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [caret, setCaret] = useState(0)
  /** Slutet på det markerade; lika med caret när inget är markerat. */
  const [selEnd, setSelEnd] = useState(0)
  /** Förslaget man valt med pilarna eller musen; null = inget valt än. */
  const [active, setActive] = useState<number | null>(null)
  const [closed, setClosed] = useState(false)
  /** Vad som ska vara markerat när fältet ritats om (efter ett insatt namn eller ett steg). */
  const pendingSel = useRef<[number, number] | null>(null)
  const selectAll = useSelectAll()
  // Pekskärm: eget sifferblock i stället för systemets tangentbord (se Numpad), och då ingen förslagslista.
  const coarse = useCoarsePointer()
  const [box, setBox] = useState<HTMLElement | null>(null)
  /** Man bytte till systemets tangentbord i blocket; gäller tills fältet lämnas. */
  const [keyboard, setKeyboard] = useState(false)
  const numpad = coarse && focused && !keyboard
  /**
   * När blocket senast trycktes (ms). Tappar fältet fokus strax efter (Safari på iOS kan flytta
   * fokus vid ett tryck trots allt), tar det tillbaka fokus i stället för att spara och stänga.
   * 0 = stäng på riktigt (OK, tangentbordsknappen).
   */
  const padPress = useRef(0)
  // Andra delar av appen (måttrutans OK) behöver veta att blocket är öppet.
  useEffect(() => {
    if (!numpad) return
    useNumpadStore.getState().setOpen(true)
    return () => useNumpadStore.getState().setOpen(false)
  }, [numpad])
  /** Markören som ref (samma som caret/selEnd), för sifferblocket när fältet tappat fokus. */
  const sel = useRef<[number, number]>([0, 0])

  useLayoutEffect(() => {
    const sel = pendingSel.current
    if (sel === null) return
    pendingSel.current = null
    ref.current?.setSelectionRange(...sel)
  })

  const names = params.map((p) => p.name).filter((n) => n !== exclude)
  const list = focused && !closed && !numpad ? suggestions(names, value, caret, selEnd) : []
  const open = list.length > 0
  // Skriver man ett namn är första förslaget förvalt. Visar listan alla namn (tomt eller
  // markerat fält) är inget förvalt, så att Enter sparar talet i stället för att byta ut det.
  const typingName = selEnd === caret && wordAt(value, caret).word !== ''
  const index = Math.min(active ?? (typingName ? 0 : -1), list.length - 1)

  // Listan ligger i en portal, så att panelen inte klipper den, och följer rutan runt fältet
  // (data-field-box), inte själva textfältet: annars hamnar den efter en axelbokstav eller etikett.
  const {
    refs: { setFloating, setReference },
    floatingStyles,
  } = useFloating({
    open,
    placement: placement === 'below' ? 'bottom-start' : 'top-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      // Får listan inte plats från rutans vänsterkant linjerar den med högerkanten,
      // och får den inte plats under hamnar den ovanför.
      flip({
        padding: 8,
        crossAxis: true,
        fallbackPlacements:
          placement === 'below' ? ['bottom-end', 'top-start', 'top-end'] : ['top-end', 'bottom-start', 'bottom-end'],
      }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, availableHeight, elements }) {
          elements.floating.style.minWidth = `${rects.reference.width}px`
          elements.floating.style.maxHeight = `${Math.min(224, availableHeight)}px`
        },
      }),
    ],
  })
  useLayoutEffect(() => {
    if (!open) return
    const el = ref.current
    setReference(el?.closest<HTMLElement>('[data-field-box]') ?? el)
  }, [open, setReference])

  const readCaret = () => {
    const at = ref.current?.selectionStart ?? value.length
    const end = ref.current?.selectionEnd ?? at
    setCaret(at)
    setSelEnd(end)
    sel.current = [at, end]
  }

  const choose = (name: string) => {
    const next = insertName(value, caret, name, selEnd)
    onChange(next.text)
    setCaret(next.caret)
    setSelEnd(next.caret)
    setActive(null)
    pendingSel.current = [next.caret, next.caret]
  }

  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const step = arrowStep(e)
    // Ett rent tal stegas, också när listan är öppen. Ett uttryck stegas inte, det skulle skrivas över.
    const stepped = step !== null ? stepText(value || String(rest.placeholder ?? ''), step) : null
    if (stepped !== null) {
      e.preventDefault()
      onChange(stepped)
      onStep?.(stepped)
      // Allt förblir markerat, så att det man skriver sedan ersätter värdet.
      pendingSel.current = [0, stepped.length]
      return
    }
    if (open) {
      if (step !== null) {
        e.preventDefault()
        const dir = step > 0 ? -1 : 1
        setActive(index < 0 ? (dir > 0 ? 0 : list.length - 1) : (index + dir + list.length) % list.length)
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && index >= 0) {
        e.preventDefault()
        choose(list[index]!)
        return
      }
      if (e.key === 'Escape') {
        // Första Esc stänger listan; nästa går vidare till fältet.
        e.preventDefault()
        e.stopPropagation()
        setClosed(true)
        return
      }
    }
    onKeyDown?.(e)
  }

  /** Tangent på sifferblocket: ändra texten där markören står, som om man skrivit. */
  const applyEdit = (edit: (value: string, start: number, end: number) => Edit) => {
    const el = ref.current
    // Har fältet tappat fokus (se onBlur) gäller markören som fältet senast hade.
    const hasFocus = !!el && document.activeElement === el
    const [start, end] = hasFocus ? [el.selectionStart ?? value.length, el.selectionEnd ?? value.length] : sel.current
    const next = edit(value, start, end)
    onChange(next.text)
    setCaret(next.caret)
    setSelEnd(next.caret)
    sel.current = [next.caret, next.caret]
    pendingSel.current = [next.caret, next.caret]
  }
  /** OK på sifferblocket: som Enter. I måttrutan skickas formuläret; annars sparar fältet självt vid Enter. */
  const ok = () => {
    const el = ref.current
    if (!el) return
    padPress.current = 0
    if (el.form) el.form.requestSubmit()
    else el.dispatchEvent(new globalThis.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    if (document.activeElement === el) el.blur()
    // Blocket stängs direkt, också om blur inte kommer (fältet ritas om efter att måttet satts).
    setFocused(false)
  }

  const byName = new Map(params.map((p) => [p.name, p.value]))
  const parts = badges && !focused && value ? segments(value, new Set(byName.keys())) : null
  const showBadges = !!parts?.some((p) => p.param)

  return (
    <span className={`relative ${wrapperClass}`}>
      <input
        {...rest}
        ref={ref}
        value={value}
        autoComplete="off"
        // Sifferblocket i stället för tangentbordet; ett fysiskt tangentbord skriver ändå.
        inputMode={keyboard ? 'text' : coarse ? 'none' : rest.inputMode}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className={`${className} ${showBadges ? 'text-transparent' : ''}`}
        // Badges klipps i smala fält; hela uttrycket syns som tooltip.
        title={showBadges ? value : rest.title}
        onChange={(e) => {
          onChange(e.target.value)
          const at = e.target.selectionStart ?? e.target.value.length
          const end = e.target.selectionEnd ?? at
          setCaret(at)
          setSelEnd(end)
          sel.current = [at, end]
          setClosed(false)
          setActive(null)
        }}
        onSelect={readCaret}
        onKeyDown={keyDown}
        onMouseDown={selectAll.onMouseDown}
        onMouseUp={selectAll.onMouseUp}
        onFocus={(e) => {
          setFocused(true)
          setBox(e.currentTarget.closest<HTMLElement>('[data-field-box]') ?? e.currentTarget)
          setClosed(false)
          selectAll.onFocus(e)
          readCaret()
          if (value === '' && fillOnFocus && onFill) {
            onFill(fillOnFocus)
            pendingSel.current = [0, fillOnFocus.length]
            sel.current = [0, fillOnFocus.length]
            setCaret(0)
            setSelEnd(fillOnFocus.length)
          }
          onFocus?.(e)
        }}
        onBlur={(e) => {
          if (numpad && performance.now() - padPress.current < 700) {
            // Ett tryck i blocket tog fokus: ta tillbaka det, med markören där den stod.
            const el = e.currentTarget
            setTimeout(() => {
              el.focus()
              // Markören som fältet har koll på, inte den fokus ger (allt markerat): ett tryck till
              // kan ha hunnit komma emellan.
              el.setSelectionRange(...sel.current)
            }, 0)
            return
          }
          setFocused(false)
          setKeyboard(false)
          setActive(null)
          selectAll.onBlur()
          onBlur?.(e)
        }}
      />
      {showBadges && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre ${padX}`}
        >
          {parts!.map((p, i) =>
            p.param ? (
              <span key={i} className="rounded-md bg-accent-soft px-1.5 text-[13px] leading-6 font-medium text-accent">
                {p.text}
              </span>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </span>
      )}
      {numpad && (
        <Numpad
          anchor={box}
          placement={placement}
          names={names}
          onInsert={(text) => applyEdit((v, s, e) => insertAt(v, s, e, text))}
          onName={(name) => applyEdit((v, s, e) => nameAt(v, s, e, name))}
          onBackspace={() => applyEdit(backspaceAt)}
          onOk={ok}
          onPress={() => (padPress.current = performance.now())}
          onKeyboard={() => {
            // Safari visar tangentbordet först när fältet får fokus av ett tryck: släpp och ta fokus igen,
            // här i tryckets händelse. Fältet sparar då som när man lämnar det.
            const el = ref.current
            if (!el) return
            setKeyboard(true)
            padPress.current = 0
            el.inputMode = 'text'
            el.blur()
            el.focus()
            // Fokus markerar allt (useSelectAll); här vill man skriva vidare, så markören sist.
            el.setSelectionRange(el.value.length, el.value.length)
            setKeyboard(true)
          }}
        />
      )}
      {open &&
        createPortal(
          <ul
            ref={setFloating}
            role="listbox"
            style={floatingStyles}
            className="z-50 w-max max-w-72 overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-lg"
          >
            {list.map((name, i) => (
              <li key={name} role="option" aria-selected={i === index}>
                <button
                  type="button"
                  tabIndex={-1}
                  // Behåll fokus i fältet, annars sparas det innan namnet satts in.
                  onPointerDown={(e) => {
                    e.preventDefault()
                    choose(name)
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex h-9 w-full cursor-pointer items-center justify-between gap-4 rounded-md px-2.5 text-left narrow:h-11 ${i === index ? 'bg-hover' : ''}`}
                >
                  <span className="rounded-md bg-accent-soft px-1.5 text-[13px] leading-6 font-medium text-accent">
                    {name}
                  </span>
                  <span className="text-xs text-muted tabular-nums">{fmt.format(byName.get(name) ?? 0)} mm</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </span>
  )
}
