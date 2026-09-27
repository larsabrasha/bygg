import { useState, type ReactNode } from 'react'
import { ExprInput } from './ExprInput'
import { field } from './ui'
import { useDraft } from './useDraft'
import { useSelectAll } from './useSelectAll'

/** Fält som sparar vid Enter eller när fokus lämnar, så att varje tangent inte blir ett ångra-steg. */
export function CommitField({
  value,
  onCommit,
  className = field,
  inputMode,
  prefix,
  suffix,
  label,
  placeholder,
  expr = false,
}: {
  value: string
  /** Returnerar felmeddelande, eller null om värdet sparades. */
  onCommit: (text: string) => string | null
  className?: string
  inputMode?: 'text' | 'decimal'
  /** Visas inne i fältet före värdet, t.ex. axelns bokstav. */
  prefix?: ReactNode
  /** Enheten inne i fältet, t.ex. mm. */
  suffix?: string
  /** Namn för skärmläsare när fältet saknar synlig etikett. */
  label?: string
  /** Blek text i ett tomt fält, t.ex. ett exempel. */
  placeholder?: string
  /** Fältet tar uttryck: föreslå parametrar och visa dem som badges. */
  expr?: boolean
}) {
  const [text, setText] = useDraft(value)
  const [error, setError] = useState<string | null>(null)
  const selectAll = useSelectAll()
  const save = () => {
    if (text === value) return setError(null)
    const e = onCommit(text)
    setError(e)
  }
  const boxed = !!(prefix || suffix)
  const inputClass = boxed
    ? // w-full: fältet ligger i ExprInputs omslag, där flex-1 inte når; utan det sticker det ut ur rutan
      // och panelen kan skjutas åt sidan när det får fokus.
      'w-full min-w-0 flex-1 bg-transparent text-ink tabular-nums outline-none'
    : `${className} ${error ? 'border-danger' : ''}`
  const common = {
    'aria-label': label,
    'aria-invalid': !!error,
    placeholder,
    inputMode,
    onBlur: save,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur()
      if (e.key === 'Escape') {
        setText(value)
        setError(null)
      }
    },
  }
  const input = expr ? (
    <ExprInput
      {...common}
      value={text}
      onChange={setText}
      // Ett steg med piltangenterna sparas direkt, så att delen ändras medan man stegar.
      onStep={(t) => setError(onCommit(t))}
      badges
      className={inputClass}
      // Utan ram räknas kanten (1 px) med i fältets utfyllnad.
      padX={boxed ? 'px-0' : 'px-[11px]'}
      wrapperClass={boxed ? 'block min-w-0 flex-1' : 'block w-full'}
    />
  ) : (
    <input
      {...common}
      {...selectAll}
      onBlur={() => {
        selectAll.onBlur()
        save()
      }}
      className={inputClass}
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  )
  return (
    <>
      {prefix || suffix ? (
        <span
          data-field-box
          className={`flex h-10 items-center gap-1.5 rounded-lg border bg-field px-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft narrow:h-11 ${error ? 'border-danger' : 'border-line'}`}
        >
          {prefix}
          {input}
          {suffix && <span className="text-[13px] text-unit">{suffix}</span>}
        </span>
      ) : (
        input
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </>
  )
}
