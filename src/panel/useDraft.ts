import { useState } from 'react'

/**
 * Text som användaren redigerar, som nollställs när värdet ändras utifrån
 * (ångra, parameter, namnbyte). Byter inte key, så fältet behåller fokus.
 */
export function useDraft(value: string) {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }
  return [draft, setDraft] as const
}
