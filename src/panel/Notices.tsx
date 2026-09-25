import { useLibraryStore } from '../store/libraryStore'
import { primaryButton } from './ui'

/** Meddelanden från synken (krockar, ändringar från andra enheter). Ligger kvar tills man stänger dem. */
export function Notices() {
  const notices = useLibraryStore((s) => s.notices)
  const dismiss = useLibraryStore((s) => s.dismiss)
  if (notices.length === 0) return null
  return (
    <div
      className="absolute top-2 left-1/2 z-40 flex w-max max-w-[calc(100%-16px)] -translate-x-1/2 flex-col gap-1.5"
      role="status"
    >
      {notices.map((n) => (
        <div key={n.id} className="flex items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2 shadow-md">
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
      ))}
    </div>
  )
}
