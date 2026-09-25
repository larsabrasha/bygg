import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/react-dom'
import { useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useDocumentStore } from '../store/documentStore'
import { insertName, segments, suggestions, wordAt } from './paramSuggest'
import { arrowStep, stepText } from './numberStep'
import { numberFormat } from '../model/numberFormat'

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
  /** Ett klick håller på att ge fältet fokus; se onMouseUp. */
  const clickFocus = useRef(false)

  useLayoutEffect(() => {
    const sel = pendingSel.current
    if (sel === null) return
    pendingSel.current = null
    ref.current?.setSelectionRange(...sel)
  })

  const names = params.map((p) => p.name).filter((n) => n !== exclude)
  const list = focused && !closed ? suggestions(names, value, caret, selEnd) : []
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
    setCaret(at)
    setSelEnd(ref.current?.selectionEnd ?? at)
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
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className={`${className} ${showBadges ? 'text-transparent' : ''}`}
        // Badges klipps i smala fält; hela uttrycket syns som tooltip.
        title={showBadges ? value : rest.title}
        onChange={(e) => {
          onChange(e.target.value)
          const at = e.target.selectionStart ?? e.target.value.length
          setCaret(at)
          setSelEnd(e.target.selectionEnd ?? at)
          setClosed(false)
          setActive(null)
        }}
        onSelect={readCaret}
        onKeyDown={keyDown}
        onMouseDown={(e) => {
          clickFocus.current = document.activeElement !== e.currentTarget
        }}
        // Klicket sätter markören efter fokus; markera allt igen om den tog bort markeringen.
        onMouseUp={(e) => {
          if (!clickFocus.current) return
          clickFocus.current = false
          const el = e.currentTarget
          if (el.selectionStart === el.selectionEnd) {
            e.preventDefault()
            el.select()
          }
        }}
        onFocus={(e) => {
          setFocused(true)
          setClosed(false)
          e.currentTarget.select()
          readCaret()
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          setActive(null)
          clickFocus.current = false
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
