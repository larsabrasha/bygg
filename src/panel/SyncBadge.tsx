import { CloudAlert, CloudOff, HardDrive, LogIn } from 'lucide-react'
import { useLibraryStore, type SyncStatus } from '../store/libraryStore'
import { loginUrl } from '../sync/auth'
import { saveNow, syncNow } from '../sync/session'
import { Tip } from './Tip'

const LABEL: Record<SyncStatus, string> = {
  starting: 'Startar…',
  syncing: 'Synkar…',
  synced: 'Synkad',
  offline: 'Offline – sparas på enheten',
  'local-only': 'Bara på den här enheten',
  error: 'Synkfel',
  'logged-out': 'Utloggad – sparas på enheten',
  guest: 'Utan konto – sparas bara i webbläsaren',
}

const syncLabel = (status: SyncStatus, error: string | null) =>
  LABEL[status] + (status === 'error' && error ? `: ${error}` : '')

/**
 * Synken syns bara när något är fel (offline, synkfel, utloggad) och utan konto. Ett tryck
 * försöker igen och visar vad som hänt, eller går till inloggningen. withLabel = visa texten bredvid ikonen på bred skärm (startvyn).
 */
export function SyncBadge({ withLabel = true }: { withLabel?: boolean }) {
  const status = useLibraryStore((s) => s.status)
  const error = useLibraryStore((s) => s.error)
  if (status !== 'offline' && status !== 'error' && status !== 'logged-out' && status !== 'guest') return null
  const label = syncLabel(status, error)
  const guest = status === 'guest'
  // Utan konto leder märket också till inloggningen.
  const loggedOut = status === 'logged-out' || guest
  const Icon = guest ? HardDrive : loggedOut ? LogIn : status === 'offline' ? CloudOff : CloudAlert

  return (
    <Tip label={`${label}. Klicka för att ${loggedOut ? 'logga in' : 'försöka igen'}.`}>
      <button
        className={`flex min-h-9 max-w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-xs hover:bg-hover narrow:min-h-11 ${
          status === 'error' ? 'text-danger' : guest ? 'text-muted' : 'text-warn'
        }`}
        aria-label={`${label}. ${loggedOut ? 'Logga in' : 'Försök synka igen'}.`}
        onClick={() => {
          if (loggedOut) {
            void saveNow().finally(() => location.assign(loginUrl()))
            return
          }
          void syncNow()
          useLibraryStore.getState().notify(label)
        }}
      >
        <Icon size={18} aria-hidden className="shrink-0" />
        {/* På smal skärm bara ikonen; ett tryck visar texten. */}
        {withLabel && <span className="truncate narrow:hidden">{label}</span>}
      </button>
    </Tip>
  )
}
