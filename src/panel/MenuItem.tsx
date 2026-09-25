import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** En rad i en meny: ikon och text, hela raden klickbar. 44 px hög på smal skärm. */
export function MenuItem({
  Icon,
  children,
  onClick,
  disabled = false,
  danger = false,
}: {
  Icon: LucideIcon
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      className={`flex min-h-9 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-left hover:bg-hover disabled:cursor-default disabled:text-disabled disabled:hover:bg-transparent narrow:min-h-11 ${
        danger ? 'text-danger' : ''
      }`}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}
