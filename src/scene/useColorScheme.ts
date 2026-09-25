import { useSyncExternalStore } from 'react'

const query = typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)')

function subscribe(onChange: () => void) {
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

/** Systemets färgtema. Uppdateras direkt när användaren byter tema. */
export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, () => (query?.matches ? 'dark' : 'light'))
}
