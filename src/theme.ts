import { useSyncExternalStore } from 'react'

/** Temat som användaren valt. System följer enhetens inställning. */
export type ThemeChoice = 'system' | 'light' | 'dark'
export type ColorScheme = 'light' | 'dark'

export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark']

/** Samma nyckel läser skriptet i index.html, innan sidan ritas första gången. */
const KEY = 'bygg.theme'
/** Webbläsarens list (theme-color): panelens färg, som i index.html. */
const BAR: Record<ColorScheme, string> = { light: '#fbfaf8', dark: '#24221f' }

const query = typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

/** Utan lagring (privat fönster m.m.), eller med ett okänt värde, följer temat systemet. */
function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY)
    return THEME_CHOICES.find((c) => c === saved) ?? 'system'
  } catch {
    return 'system'
  }
}

let choice = readChoice()

function resolve(): ColorScheme {
  if (choice !== 'system') return choice
  return query?.matches ? 'dark' : 'light'
}

/** Färgerna i index.css hänger på data-theme. Listen i webbläsaren följer med. */
function apply() {
  if (typeof document === 'undefined') return
  const scheme = resolve()
  document.documentElement.dataset.theme = scheme
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    // Med System står varje färg vid sitt media-villkor; med ett eget val gäller samma färg i båda.
    const own: ColorScheme = meta.media.includes('dark') ? 'dark' : 'light'
    meta.content = BAR[choice === 'system' ? own : scheme]
  }
  for (const l of listeners) l()
}

query?.addEventListener('change', apply)
// Valet i en annan flik gäller också här.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    choice = readChoice()
    apply()
  })
}
apply()

export function themeChoice(): ThemeChoice {
  return choice
}

/** Sparas per enhet, som vyns utseende. */
export function setThemeChoice(next: ThemeChoice) {
  choice = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Går inte att spara; valet gäller tills sidan laddas om.
  }
  apply()
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

/** Det valda temat: System, Ljust eller Mörkt. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, themeChoice)
}

/** Temat som gäller just nu: valet, eller systemets när valet är System. Uppdateras direkt. */
export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, resolve)
}
