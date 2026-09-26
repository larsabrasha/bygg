import type { ReactNode } from 'react'

/**
 * Tomt läge i en flik: en liten bild, en rubrik och en rad om vad man gör.
 * Samma i Egenskaper, Parametrar och Kaplista.
 */
export function EmptyState({ picture, title, children }: { picture: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-4 text-center">
      <svg viewBox="0 0 120 84" className="h-20 w-auto" aria-hidden>
        {picture}
      </svg>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="text-[13px] text-muted">{children}</p>
      </div>
    </div>
  )
}
