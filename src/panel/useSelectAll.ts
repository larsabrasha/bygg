import { useRef } from 'react'

/**
 * Hela texten markeras när fältet får fokus, så att det man skriver ersätter
 * den. Med ett klick sätter webbläsaren markören efter fokus och tar bort
 * markeringen; då markeras allt igen när knappen släpps. Ett klick i ett fält
 * som redan har fokus flyttar markören som vanligt.
 */
export function useSelectAll() {
  const clickFocus = useRef(false)
  return {
    onMouseDown: (e: React.MouseEvent<HTMLInputElement>) => {
      clickFocus.current = document.activeElement !== e.currentTarget
    },
    onMouseUp: (e: React.MouseEvent<HTMLInputElement>) => {
      if (!clickFocus.current) return
      clickFocus.current = false
      const el = e.currentTarget
      if (el.selectionStart === el.selectionEnd) {
        e.preventDefault()
        el.select()
      }
    },
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
    onBlur: () => {
      clickFocus.current = false
    },
  }
}
