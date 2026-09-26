import { Check, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** En rad i en meny: ikon och text, hela raden klickbar. 44 px hög på smal skärm. */
export function MenuItem({
  Icon,
  children,
  onClick,
  disabled = false,
  danger = false,
  checked,
  hint,
}: {
  Icon: LucideIcon
  children: ReactNode
  /** En rad under texten om vad det är till för. */
  hint?: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  /** Ett läge som är av eller på: en bock visar att det är på. */
  checked?: boolean
}) {
  return (
    <button
      className={`flex min-h-9 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-left hover:bg-hover disabled:cursor-default disabled:text-disabled disabled:hover:bg-transparent narrow:min-h-11 ${
        danger ? 'text-danger' : ''
      }`}
      disabled={disabled}
      onClick={onClick}
      {...(checked !== undefined && { role: 'menuitemcheckbox', 'aria-checked': checked })}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
      {hint ? (
        <span className="flex min-w-0 flex-1 flex-col py-1.5">
          <span className="truncate">{children}</span>
          <span className="truncate text-xs text-muted">{hint}</span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{children}</span>
      )}
      {checked && <Check size={16} strokeWidth={2} aria-hidden className="shrink-0 text-accent" />}
    </button>
  )
}
