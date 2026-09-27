import { Presentation, ScrollText, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useLibraryStore } from '../store/libraryStore'
import { Logo } from './Logo'
import { Tip } from './Tip'
import { iconAction } from './ui'

const COMMIT = import.meta.env.BUILD_COMMIT
/** Sidan med licenserna, som bygget lägger bredvid index.html (scripts/attributions.ts). */
const LICENSES_URL = `${import.meta.env.BASE_URL}licenser.html`
/** Startsidan, också för den som är inloggad (se main.tsx). */
const INTRO_URL = `${import.meta.env.BASE_URL}intro`
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

/**
 * GitHubs symbol (Octicons mark-github, MIT). lucide har inga varumärken sedan version 1.
 * Färgen följer texten.
 */
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" aria-hidden>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  )
}

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
