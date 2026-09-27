import type { ComponentProps } from 'react'

/**
 * Av/på-knapp som på iOS: texten och ett litet reglage som visar läget. Diskret,
 * utan bakgrund, för ett val man sällan ändrar; hela raden går att trycka på
 * och är lika hög som knapparna bredvid (touchyta). Övriga props
 * (och ref) går till knappen, så att den kan ligga i en Tip.
 */
export function Switch({
  checked,
  onChange,
  children,
  ...rest
}: Omit<ComponentProps<'button'>, 'onChange'> & { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        rest.onClick?.(e)
        onChange(!checked)
      }}
      className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs text-muted hover:bg-hover narrow:h-11"
    >
      {children}
      <span
        aria-hidden
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-disabled'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-3 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-3' : ''}`}
        />
      </span>
    </button>
  )
}
