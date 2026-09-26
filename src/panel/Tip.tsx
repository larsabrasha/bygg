import * as Tooltip from '@radix-ui/react-tooltip'
import type { ReactElement, ReactNode } from 'react'

/**
 * Tooltips med Radix i stället för title: webbläsarens egna dröjer över en
 * sekund och går inte att ställa in. Radix visar dem inte vid touch (där
 * skymmer fingret ändå), och när en har visats syns nästa direkt.
 */
export function TipProvider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={400}>
      {children}
    </Tooltip.Provider>
  )
}

type Props = {
  label: ReactNode
  /** Kortkommando, visas svagare efter texten. */
  keys?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Ett enda element som tar emot ref och händelser, t.ex. en knapp. */
  children: ReactElement
}

export function Tip({ label, keys, side = 'bottom', children }: Props) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 flex max-w-64 items-center gap-2 rounded-md bg-ink px-2 py-1 text-xs text-panel shadow-md select-none"
        >
          <span>{label}</span>
          {keys && <kbd className="font-sans opacity-60">{keys}</kbd>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
