import {
  ChevronLeft,
  ChevronRight,
  Info,
  Monitor,
  Moon,
  Palette,
  Settings,
  Sun,
  SunMoon,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId } from 'react'
import { useLibraryStore, type SettingsPage } from '../store/libraryStore'
import { setThemeChoice, useThemeChoice, type ThemeChoice } from '../theme'
import { About } from './AboutPage'
import { Colors, Materials } from './CatalogPages'
import { Plank } from './lookIcons'
import { Tip } from './Tip'
import { iconAction, listCard, listRow, segment, segmentGroup } from './ui'

type Page = Exclude<SettingsPage, 'menu'>

const PAGES: { page: Page; label: string; Icon: LucideIcon }[] = [
  { page: 'general', label: 'Allmänt', Icon: Settings },
  { page: 'materials', label: 'Material', Icon: Plank },
  { page: 'colors', label: 'Färger', Icon: Palette },
  { page: 'about', label: 'Om Bygg', Icon: Info },
]

const ICON = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const

/**
 * Inställningar, som Systeminställningar i macOS: sidorna i en lista till vänster, den valda till
 * höger. På smal skärm som i iOS: först listan, sedan sidan för sig med en knapp tillbaka.
 * Allmänt gäller enheten (tema; språk och enheter hamnar här när de kommer), Material och Färger
 * följer kontot, och sist står Om Bygg. Ett blad ovanpå allt, som ritningen; på smal skärm hela skärmen.
 */
export function SettingsSheet() {
  const page = useLibraryStore((s) => s.settings)
  const set = useLibraryStore((s) => s.set)
  const open = page !== null
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set({ settings: null })
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, set])
  if (!page) return null
  const close = () => set({ settings: null })
  // Från kugghjulet: på smal skärm listan, på bred Allmänt bredvid den.
  const menu = page === 'menu'
  const shown: Page = menu ? 'general' : page
  const current = PAGES.find((p) => p.page === shown)!

  const navList = (pages: typeof PAGES, className = '') => (
    <ul
      className={`flex flex-col gap-0.5 px-2 narrow:mx-4 narrow:gap-0 narrow:overflow-hidden narrow:rounded-lg narrow:bg-hover narrow:px-0 ${className}`}
    >
      {pages.map(({ page: p, label, Icon }) => (
        <li
          key={p}
          className="relative narrow:before:absolute narrow:before:top-0 narrow:before:right-0 narrow:before:left-11 narrow:before:h-px narrow:before:bg-line narrow:first:before:hidden"
        >
          <button
            className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left hover:bg-hover aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent narrow:h-12 narrow:aria-[current=page]:bg-transparent narrow:aria-[current=page]:text-ink narrow:gap-3 narrow:rounded-none narrow:px-3 narrow:hover:bg-button"
            aria-current={p === shown ? 'page' : undefined}
            onClick={() => set({ settings: p })}
          >
            <Icon {...ICON} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">{label}</span>
            <ChevronRight size={18} className="hidden shrink-0 text-faint narrow:block" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  )

  const closeButton = (className = '') => (
    <Tip label="Stäng">
      <button className={`${iconAction} hover:bg-hover ${className}`} aria-label="Stäng" onClick={close}>
        <X {...ICON} />
      </button>
    </Tip>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden narrow:items-stretch"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Inställningar"
        className="flex h-[min(88dvh,760px)] w-[min(820px,calc(100vw-32px))] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl narrow:h-dvh narrow:w-full narrow:rounded-none narrow:border-0"
      >
        <nav
          aria-label="Sidor"
          className={`flex w-52 shrink-0 flex-col gap-2 border-r border-line bg-canvas narrow:w-full narrow:border-0 ${menu ? '' : 'narrow:hidden'}`}
        >
          <header className="flex items-center gap-2 px-4 py-2 pt-[max(8px,env(safe-area-inset-top))]">
            <h2 className="flex h-10 flex-1 items-center text-base font-semibold narrow:h-11">Inställningar</h2>
            {closeButton('hidden narrow:grid')}
          </header>
          {/* Bred skärm: markeringen fyller raden, som i macOS. Smal: kort med pilar, som i iOS. */}
          {navList(PAGES.filter((p) => p.page !== 'about'))}
          {/* Om Bygg allra längst ner, skild från inställningarna; på smal skärm ett eget kort under dem. */}
          {navList(
            PAGES.filter((p) => p.page === 'about'),
            'mt-auto mb-2 narrow:mt-4 narrow:mb-0',
          )}
        </nav>
        <section aria-label={current.label} className={`flex min-w-0 flex-1 flex-col ${menu ? 'narrow:hidden' : ''}`}>
          <header className="flex items-center gap-2 border-b border-line px-4 py-2 pt-[max(8px,env(safe-area-inset-top))] narrow:pl-1">
            <button
              className="hidden h-11 shrink-0 cursor-pointer items-center rounded-lg pr-2 text-accent hover:bg-hover narrow:inline-flex"
              onClick={() => set({ settings: 'menu' })}
            >
              <ChevronLeft size={24} strokeWidth={1.75} aria-hidden />
              Inställningar
            </button>
            <h3 className="flex h-10 min-w-0 flex-1 items-center truncate text-base font-semibold narrow:h-11">
              {current.label}
            </h3>
            {closeButton()}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            <Content page={shown} />
          </div>
        </section>
      </div>
    </div>
  )
}

function Content({ page }: { page: Page }) {
  switch (page) {
    case 'general':
      return <General />
    case 'materials':
      return <Materials />
    case 'colors':
      return <Colors />
    case 'about':
      return <About />
  }
}

/** Allmänt: det som gäller enheten. Varje inställning är en rad i ett kort, som i iOS. */
function General() {
  return (
    <div className={listCard}>
      <ThemeSetting />
    </div>
  )
}

const THEMES: { value: ThemeChoice; label: string; Icon: LucideIcon }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Ljust', Icon: Sun },
  { value: 'dark', label: 'Mörkt', Icon: Moon },
]

/** Temat: som systemet, alltid ljust eller alltid mörkt. */
function ThemeSetting() {
  const choice = useThemeChoice()
  const label = useId()
  return (
    // På smal skärm får skenan inte plats bredvid namnet: den står då på en egen rad under, i samma kort.
    <div
      className={`${listRow} flex min-h-13 w-full flex-wrap items-center gap-3 gap-y-2.5 py-1.5 pr-1.5 pl-3 narrow:pt-3 narrow:pr-3 narrow:pb-3`}
    >
      <SunMoon {...ICON} className="shrink-0 text-muted" />
      <span id={label} className="min-w-0 flex-1">
        Tema
      </span>
      <div className={`${segmentGroup} w-64 shrink-0 narrow:w-full`} role="group" aria-labelledby={label}>
        {THEMES.map(({ value, label, Icon }) => (
          <button
            key={value}
            className={`${segment} inline-flex items-center justify-center gap-1 px-2`}
            aria-pressed={choice === value}
            onClick={() => setThemeChoice(value)}
          >
            <Icon size={15} strokeWidth={1.75} aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
