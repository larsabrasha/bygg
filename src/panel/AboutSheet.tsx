import { Presentation, ScrollText, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useLibraryStore } from '../store/libraryStore'
import { GitHubMark, REPO_URL } from './GitHubMark'
import { Logo } from './Logo'
import { Tip } from './Tip'
import { iconAction } from './ui'

const COMMIT = import.meta.env.BUILD_COMMIT
/** Sidan med licenserna, som bygget lägger bredvid index.html (scripts/attributions.ts). */
const LICENSES_URL = `${import.meta.env.BASE_URL}licenser.html`
/** Startsidan, också för den som är inloggad (se main.tsx). */
const INTRO_URL = `${import.meta.env.BASE_URL}intro`

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
        <Logo height={40} />
        <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-canvas p-3">
          <Row label="Version">
            <Commit />
          </Row>
        </dl>
        <p className="text-center text-muted">
          Idéer, design och finsnickeri: Lars Arvidsson.
          <br />
          Koden hyvlad av Claude, tills Lars var nöjd.
        </p>
        {/* Länkar ut ur appen, inte åtgärder: en lätt rad, som i en Om-ruta på macOS. Startsidan öppnas i
            samma flik, så att appen inte är öppen i två (där leder "Öppna Bygg" tillbaka); resten i nya flikar. */}
        <nav
          aria-label="Länkar"
          className="flex w-full flex-wrap justify-center gap-x-2 gap-y-1 border-t border-line pt-3"
        >
          <a href={INTRO_URL} className={outLink}>
            <Presentation size={16} strokeWidth={1.75} aria-hidden />
            Intro
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className={outLink}>
            <GitHubMark />
            GitHub
          </a>
          <a href={LICENSES_URL} target="_blank" rel="noreferrer" className={outLink}>
            <ScrollText size={16} strokeWidth={1.75} aria-hidden />
            Licenser
          </a>
        </nav>
      </div>
    </div>
  )
}

/** En länk i raden längst ner: som text, med en yta som är lätt att träffa med fingret. */
const outLink =
  'inline-flex h-9 items-center gap-1.5 rounded-md px-2 whitespace-nowrap text-accent hover:bg-hover narrow:h-11'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

/** Commiten, kort och som länk till GitHub. */
function Commit() {
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
      {dirty && (
        <span className="text-warn" title="Ändringar som inte är incheckade">
          + lokala ändringar
        </span>
      )}
    </span>
  )
}
