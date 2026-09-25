import { CloudAlert, CloudOff } from 'lucide-react'
import { useLibraryStore, type SyncStatus } from '../store/libraryStore'
import { syncNow } from '../sync/session'

const LABEL: Record<SyncStatus, string> = {
  starting: 'Startar…',
  syncing: 'Synkar…',
  synced: 'Synkad',
  offline: 'Offline – sparas på enheten',
  'local-only': 'Bara på den här enheten',
  error: 'Synkfel',
}

const syncLabel = (status: SyncStatus, error: string | null) =>
  LABEL[status] + (status === 'error' && error ? `: ${error}` : '')

/**
 * Synken syns bara när något är fel: offline eller synkfel. Ett tryck försöker
 * igen och visar vad som hänt. withLabel = visa texten bredvid ikonen på bred skärm (startvyn).
 */
export function SyncBadge({ withLabel = true }: { withLabel?: boolean }) {
  const status = useLibraryStore((s) => s.status)
  const error = useLibraryStore((s) => s.error)
  if (status !== 'offline' && status !== 'error') return null
  const label = syncLabel(status, error)
  const Icon = status === 'offline' ? CloudOff : CloudAlert

  return (
    <button
      className={`flex min-h-9 max-w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-xs hover:bg-hover narrow:min-h-11 ${
        status === 'offline' ? 'text-warn' : 'text-danger'
      }`}
      aria-label={`${label}. Försök synka igen.`}
      title={`${label}. Tryck för att försöka igen.`}
      onClick={() => {
        void syncNow()
        useLibraryStore.getState().notify(label)
      }}
    >
      <Icon size={18} aria-hidden className="shrink-0" />
      {/* På smal skärm bara ikonen; ett tryck visar texten. */}
      {withLabel && <span className="truncate narrow:hidden">{label}</span>}
    </button>
  )
}
