import { useEffect } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { useToolStore } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import { amendableOp, applyMeasure, cancel, extendableCopy, setCopy } from './actions'

/** Tecken som går direkt till måttfältet. Bokstäver (parameternamn) skrivs i fältet, så att R/P/M fungerar som kortkommandon. */
const MEASURE_CHAR = /^[0-9.,+\-*/() ]$/

function isEditable(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))
}

/**
 * Kortkommandon som i SketchUp: R, P, M, mellanslag, Esc, Delete, ⌘Z / ⇧⌘Z, ⇧Z (visa allt),
 * Alt/Option (Kopia i Flytta-läget).
 * P och M har ingen knapp i verktygsraden; där görs push/pull med pilen och flytt från knappraden.
 * Under en operation går siffror direkt till måttfältet utan att man klickar i det;
 * ; eller Tab byter fält.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // I startvyn finns ingen modell att arbeta i.
      if (isEditable(e.target) || useLibraryStore.getState().screen === 'gallery') return
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
      // Alt/Option slår av och på Kopia i Flytta-läget, som Ctrl/Option i SketchUp.
      if (e.key === 'Alt' && !e.repeat && tools.tool === 'move') {
        e.preventDefault()
        setCopy(!tools.copy)
        return
      }
      if (mod || e.altKey) return

      const { op, measure, measureField } = tools
      // Efter en kopia går siffror till antalet, och efter en avslutad operation
      // till dess mått (för att ändra det), som under en operation.
      if (op || (tools.tool === 'move' && extendableCopy()) || amendableOp()) {
        if (MEASURE_CHAR.test(e.key)) {
          e.preventDefault()
          tools.setMeasure(measureField, measure[measureField] + e.key)
          return
        }
        // Utan pågående operation och med tomt fält tar Backspace bort det valda som vanligt.
        if (e.key === 'Backspace' && (op || measure[measureField] !== '')) {
          e.preventDefault()
          tools.setMeasure(measureField, measure[measureField].slice(0, -1))
          return
        }
        if ((e.key === ';' || e.key === 'Tab') && (op ?? tools.lastOp?.op)?.kind === 'rect') {
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
        case 'Z':
          if (e.shiftKey) useViewStore.getState().requestFit('all')
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
