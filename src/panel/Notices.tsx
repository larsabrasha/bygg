import { useEffect, useRef, useState } from 'react'
import { useLibraryStore, type Notice } from '../store/libraryStore'
import { primaryButton } from './ui'

/** Så länge ett meddelande utan knapp syns: längre text får längre tid att läsas. */
const shownMs = (text: string) => Math.min(8000, Math.max(3000, 2000 + text.length * 50))
const FADE_MS = 200

/**
 * Meddelanden från synken och appen (ändringar från andra enheter, krockar). Ett meddelande utan
 * knapp är en liten rad som försvinner av sig självt, och står still medan man pekar på det; ett
 * tryck stänger det direkt. Med en knapp, eller det man måste se (sticky), är det en ruta som ligger
 * kvar tills man stänger den.
 */
/** place: läge och bredd, t.ex. under knapparna i 3D-vyns hörn. */
export function Notices({ place = 'top-2 max-w-[calc(100%-16px)]' }: { place?: string }) {
  const notices = useLibraryStore((s) => s.notices)
  if (notices.length === 0) return null
  return (
    <div
      className={`absolute ${place} left-1/2 z-40 flex w-max -translate-x-1/2 flex-col items-center gap-1.5`}
      role="status"
    >
      {notices.map((n) =>
        n.action || n.sticky ? <StayingNotice key={n.id} n={n} /> : <PassingNotice key={n.id} n={n} />,
      )}
    </div>
  )
}

function PassingNotice({ n }: { n: Notice }) {
  const dismiss = useLibraryStore((s) => s.dismiss)
  const [leaving, setLeaving] = useState(false)
  const [held, setHeld] = useState(false)
  const left = useRef(shownMs(n.text))

  useEffect(() => {
    if (held || leaving) return
    const start = Date.now()
    const timer = setTimeout(() => setLeaving(true), left.current)
    return () => {
      clearTimeout(timer)
      left.current = Math.max(1000, left.current - (Date.now() - start))
    }
  }, [held, leaving])

  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => dismiss(n.id), FADE_MS)
    return () => clearTimeout(timer)
  }, [leaving, dismiss, n.id])

  return (
    <button
      type="button"
      className={`max-w-full animate-appear cursor-pointer rounded-2xl bg-panel/90 px-3 py-1.5 text-center text-xs text-ink shadow-sm backdrop-blur-md transition-opacity duration-200 ${leaving ? 'opacity-0' : ''}`}
      aria-label={`${n.text} Tryck för att stänga.`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onClick={() => setLeaving(true)}
    >
      {n.text}
    </button>
  )
}

function StayingNotice({ n }: { n: Notice }) {
  const dismiss = useLibraryStore((s) => s.dismiss)
  return (
    <div className="flex animate-appear items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2 shadow-md">
      <p className="flex-1 self-center text-[13px]">{n.text}</p>
      {n.action && (
        <button className={`${primaryButton} h-8`} onClick={() => void n.action!.run()}>
          {n.action.label}
        </button>
      )}
      <button
        className="cursor-pointer text-muted narrow:min-h-11 narrow:px-2"
        aria-label="Stäng"
        onClick={() => dismiss(n.id)}
      >
        ✕
      </button>
    </div>
  )
}
