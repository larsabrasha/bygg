import { useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { insertName, segments, suggestions } from './paramSuggest'
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
}

/**
 * Textfält för mått och uttryck. Medan man skriver föreslås parametrar
 * (piltangenter och Enter/Tab, eller tryck); valet ersätter ordet vid markören, eller det markerade.
 * Utan fokus visas parameternamnen som badges ovanpå texten.
 */
export function ExprInput({
  value,
  onChange,
  placement = 'below',
  badges = false,
  padX = 'px-2.5',
  exclude,
  wrapperClass = 'block w-full',
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
  const [active, setActive] = useState(0)
  const [closed, setClosed] = useState(false)
  /** Var markören ska stå när fältet ritats om efter att ett namn satts in. */
  const pendingCaret = useRef<number | null>(null)

  useLayoutEffect(() => {
    const at = pendingCaret.current
    if (at === null) return
    pendingCaret.current = null
    ref.current?.setSelectionRange(at, at)
  })

  const names = params.map((p) => p.name).filter((n) => n !== exclude)
  const list = focused && !closed ? suggestions(names, value, caret, selEnd) : []
  const open = list.length > 0
  const index = Math.min(active, list.length - 1)

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
    setActive(0)
    pendingCaret.current = next.caret
  }

  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setActive((index + step + list.length) % list.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
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
          setActive(0)
        }}
        onSelect={readCaret}
        onKeyDown={keyDown}
        onFocus={(e) => {
          setFocused(true)
          setClosed(false)
          readCaret()
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
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
      {open && (
        <ul
          role="listbox"
          className={`absolute left-0 z-50 max-h-56 w-max min-w-full max-w-72 overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-lg ${placement === 'below' ? 'top-full mt-1' : 'bottom-full mb-1'}`}
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
        </ul>
      )}
    </span>
  )
}
