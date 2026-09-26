import type { ReactNode } from 'react'
import { groupTitle } from './ui'

/** En grupp i en flik i sidopanelen: liten rubrik, ev. en förklaring till höger, och innehållet. */
export function Group({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={groupTitle}>{title}</h3>
        {note && <span className="text-xs text-faint">{note}</span>}
      </div>
      {children}
    </div>
  )
}
