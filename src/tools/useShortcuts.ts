import { useEffect } from 'react'
import { useDocumentStore } from '../store/documentStore'
import { useLibraryStore } from '../store/libraryStore'
import { useToolStore, type Op } from '../store/toolStore'
import { useViewStore } from '../store/viewStore'
import {
  amendableOp,
  applyMeasure,
  cancel,
  extendableCopy,
  setCopy,
  setExploded,
  startReadyPushPull,
  hideSelection,
  isolateSelection,
} from './actions'

/** Rektangeln har två fält (längd och bredd), som Tab växlar mellan; en cirkel bara diametern. */
const hasTwoFields = (op: Op | null | undefined) => op?.kind === 'rect' && op.shape !== 'circle'

/** Tecken som går direkt till måttfältet. Bokstäver (parameternamn) skrivs i fältet, så att R/P/M fungerar som kortkommandon. */
const MEASURE_CHAR = /^[0-9.,+\-*/() ]$/

/** Ett fält man skriver i. Inte ett reglage (sprängskissen): där ska Esc och E fortfarande fungera. */
function isEditable(t: EventTarget | null) {
  if (t instanceof HTMLInputElement && t.type === 'range') return false
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))
}

/**
 * Kortkommandon som i SketchUp: R, P, M, T (Mät), mellanslag, Esc, Delete, ⌘Z / ⇧⌘Z, ⇧Z (visa allt),
 * Alt/Option (Kopia i Flytta-läget), Tab (fokusläge), D (mått), E (sprängskiss), H / ⇧H / I (dölj, visa alla, isolera),
 * mellanslag + dra (panorera).
 * P och M har ingen knapp i verktygsraden; där görs push/pull med pilen och flytt med dubbeltryck på delen.
 * Under en operation går siffror direkt till måttfältet utan att man klickar i det;
 * ; eller Tab byter fält.
 */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // I startvyn finns ingen modell att arbeta i, och i ritningen ändrar man inget (Esc stänger den själv).
      if (isEditable(e.target) || useLibraryStore.getState().screen === 'gallery' || useViewStore.getState().drawing)
        return
      // ⌘P: det som skrivs ut är ritningen, så den öppnas. Där skriver ⌘P ut (panel/Drawing).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        useViewStore.getState().setDrawing(true)
        return
      }
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
      // En vald sida eller skiss: siffror drar ut den direkt, som efter ett tryck på pilen.
      // Inte mellanslaget, som panorerar.
      if (!op && e.key !== ' ' && MEASURE_CHAR.test(e.key) && startReadyPushPull()) {
        e.preventDefault()
        useToolStore.getState().setMeasure(0, e.key)
        return
      }
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
        if ((e.key === ';' || e.key === 'Tab') && hasTwoFields(op ?? tools.lastOp?.op)) {
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

      // Tab: fokusläge (som i Photoshop). Bara när inget har fokus, så att Tab
      // fortfarande flyttar mellan knappar när man väl är i dem.
      if (e.key === 'Tab' && !e.shiftKey && (e.target === document.body || e.target instanceof HTMLCanvasElement)) {
        e.preventDefault()
        useViewStore.getState().toggleFocusMode()
        return
      }

      switch (e.key) {
        case 'Escape':
          if (op) cancel()
          else if (useViewStore.getState().exploded) setExploded(false)
          else tools.setTool('select')
          break
        case 'd':
        case 'D':
          useViewStore.getState().toggleDims()
          break
        case 'e':
        case 'E':
          setExploded(!useViewStore.getState().exploded)
          break
        // H döljer det valda, ⇧H visar allt igen, I visar bara det valda (som i Shapr3D).
        case 'h':
          if (docs.selection?.kind === 'body') hideSelection(docs.selection.id)
          break
        case 'H':
          useViewStore.getState().showAll()
          break
        case 'i':
        case 'I':
          if (docs.selection?.kind === 'body') isolateSelection(docs.selection.id)
          break
        case ' ':
          // Hålls det nere kan man panorera med musen; Välj först när det släpps utan att man gjort det (onKeyUp).
          e.preventDefault()
          if (!e.repeat) useViewStore.getState().setSpacePan({ held: true, used: false })
          break
        case 'r':
        case 'R':
          tools.setTool('rect')
          break
        case 'c':
        case 'C':
          tools.setTool('circle')
          break
        case 'p':
        case 'P':
          tools.setTool('pushpull')
          break
        case 'm':
        case 'M':
          tools.setTool('move')
          break
        case 't':
        case 'T':
          tools.setTool('measure')
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
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== ' ') return
      const view = useViewStore.getState()
      if (!view.spacePan.held) return
      if (!view.spacePan.used) useToolStore.getState().setTool('select')
      view.setSpacePan({ held: false, used: false })
    }
    // Byter man fönster med mellanslaget nere kommer inget keyup.
    const onBlur = () => useViewStore.getState().setSpacePan({ held: false, used: false })
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}
