import { ExternalLink, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useLibraryStore } from '../store/libraryStore'
import { currentUser } from '../sync/auth'
import { isGuest } from '../sync/localStore'
import { Logo } from './Logo'
import { Tip } from './Tip'
import { iconAction, secondaryButton } from './ui'

const COMMIT = import.meta.env.BUILD_COMMIT
const built = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short' }).format(
  new Date(import.meta.env.BUILD_TIME),
)
/** Sidan med licenserna, som bygget lägger bredvid index.html (scripts/attributions.ts). */
const LICENSES_URL = `${import.meta.env.BASE_URL}licenser.html`
/** Källkoden. */
const REPO_URL = 'https://github.com/larsabrasha/bygg'

/** Om Bygg: vilken version som körs, och en länk till licenserna (i en ny flik). En liten ruta mitt på skärmen. */
export function AboutSheet() {
  const open = useLibraryStore((s) => s.aboutOpen)
  const set = useLibraryStore((s) => s.set)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set({ aboutOpen: false })
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, set])
  if (!open) return null
  const close = () => set({ aboutOpen: false })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Om Bygg"
        className="relative flex max-h-full w-[min(400px,100%)] flex-col items-center gap-5 overflow-y-auto rounded-xl border border-line bg-panel px-5 pt-8 pb-5 text-sm shadow-2xl"
      >
        <Tip label="Stäng">
          <button
            className={`${iconAction} absolute top-1.5 right-1.5 hover:bg-hover`}
            aria-label="Stäng"
            onClick={close}
          >
            <X size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </Tip>
        <div className="flex flex-col items-center gap-2">
          <Logo height={40} />
          <p className="text-center text-muted">Möbler i 3D, med kaplista och kapschema.</p>
        </div>
        <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-canvas p-3">
          <Row label="Version">
            <Commit />
          </Row>
          <Row label={import.meta.env.DEV ? 'Dev-servern startade' : 'Byggd'}>{built}</Row>
          <Row label="Konto">{account()}</Row>
        </dl>
        <p className="text-center text-muted">
          Idéer, design och finsnickeri: Lars Arvidsson.
          <br />
          Koden hyvlad av Claude, tills Lars var nöjd.
        </p>
        <div className="grid w-full grid-cols-2 gap-2 narrow:grid-cols-1">
          <a href={REPO_URL} target="_blank" rel="noreferrer" className={secondaryButton}>
            Källkoden på GitHub
            <ExternalLink size={16} aria-hidden />
          </a>
          <a href={LICENSES_URL} target="_blank" rel="noreferrer" className={secondaryButton}>
            Licenser och tack
            <ExternalLink size={16} aria-hidden />
          </a>
        </div>
      </div>
    </div>
  )
}

const account = () => {
  if (isGuest()) return 'Utan konto: allt sparas bara i den här webbläsaren'
  const user = currentUser()
  if (user?.dev) return 'dev (ingen inloggning i dev)'
  return user?.name ?? '–'
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

/** Commiten, kort och som länk till GitHub; knappen kopierar hela hashen (att klistra in i en felrapport). */
function Commit() {
  const [copied, setCopied] = useState(false)
  if (!COMMIT) return <span>okänd</span>
  const dirty = import.meta.env.BUILD_DIRTY
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <a
        href={`${REPO_URL}/commit/${COMMIT}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono hover:underline"
        title="Commiten på GitHub"
      >
        {COMMIT.slice(0, 7)}
      </a>
      {dirty && <span className="text-warn">med ändringar som inte är incheckade</span>}
      <button
        className="cursor-pointer text-accent hover:underline"
        onClick={() =>
          void navigator.clipboard?.writeText(COMMIT + (dirty ? ' (med ändringar)' : '')).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }
      >
        {copied ? 'Kopierad' : 'Kopiera'}
      </button>
    </span>
  )
}
