import { useEffect } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useToolStore } from '../store/toolStore'
import { applyMeasure, cancel } from './actions'

/** Tecken som går direkt till måttfältet. Bokstäver (parameternamn) skrivs i fältet, så att R/P/M fungerar som kortkommandon. */
const MEASURE_CHAR = /^[0-9.,+\-*/() ]$/

function isEditable(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))
}

/**
 * Kortkommandon som i SketchUp: R, P, M, mellanslag, Esc, Delete, ⌘Z / ⇧⌘Z.
 * Under en operation går siffror direkt till måttfältet utan att man klickar i det;
 * ; eller Tab byter fält.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return
      const tools = useToolStore.getState()
      const docs = useDocumentStore.getState()
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        cancel()
        if (e.shiftKey) docs.redo()
        else docs.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        cancel()
        docs.redo()
        return
      }
      if (mod || e.altKey) return

      const { op, measure, measureField } = tools
      if (op) {
        if (MEASURE_CHAR.test(e.key)) {
          e.preventDefault()
          tools.setMeasure(measureField, measure[measureField] + e.key)
          return
        }
        if (e.key === 'Backspace') {
          e.preventDefault()
          tools.setMeasure(measureField, measure[measureField].slice(0, -1))
          return
        }
        if ((e.key === ';' || e.key === 'Tab') && op.kind === 'rect') {
          e.preventDefault()
          tools.setMeasureField(measureField === 0 ? 1 : 0)
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          applyMeasure()
          return
        }
      }

      switch (e.key) {
        case 'Escape':
          if (op) cancel()
          else tools.setTool('select')
          break
        case ' ':
          e.preventDefault()
          tools.setTool('select')
          break
        case 'r':
        case 'R':
          tools.setTool('rect')
          break
        case 'p':
        case 'P':
          tools.setTool('pushpull')
          break
        case 'm':
        case 'M':
          tools.setTool('move')
          break
        case 'Delete':
        case 'Backspace':
          if (!op) docs.deleteSelection()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
