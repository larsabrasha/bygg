import { explodedCenter, explodeOffsets } from '../model/explode'
import { resolveBodies } from '../model/resolve'
import { captureView } from '../scene/viewCapture'
import { useDocumentStore } from '../store/documentStore'
import { usePrintStore } from '../store/printStore'
import { useViewStore } from '../store/viewStore'

/** Avslutar den senaste utskriften av sprängskissen: tar bort bilden och ger sidan sin rubrik igen. */
let endPrint: (() => void) | null = null

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

/**
 * Skriver ut sprängskissen som den syns, med delarnas namn. Det valda avmarkeras
 * medan bilden tas, så att det inte syns blått på papperet, och väljs sedan igen.
 */
export async function printExploded(modelName: string) {
  const docs = useDocumentStore.getState()
  const selection = docs.selection
  if (selection) {
    docs.select(null)
    await nextFrame()
  }
  const bodies = resolveBodies(useDocumentStore.getState().doc).filter((b) => !b.tool)
  const offsets = explodeOffsets(bodies, useViewStore.getState().explodeAmount)
  const image = captureView(bodies.map((b) => ({ name: b.name, at: explodedCenter(b, offsets) })))
  if (selection) useDocumentStore.getState().select(selection)
  if (!image) return

  endPrint?.()
  usePrintStore.getState().setPrint('exploded', image)
  const previous = document.title
  document.title = `${modelName.replace(/[\\/:*?"<>|]/g, '').trim() || 'Modell'} – sprängskiss`
  // Bilden står kvar tills sprängskissen stängs, inte till afterprint: på iPhone och iPad
  // kommer den innan förhandsvisningen ritats (window.print väntar inte där), och då blev sidan tom.
  const stop = useViewStore.subscribe((s) => {
    if (!s.exploded) endPrint?.()
  })
  endPrint = () => {
    endPrint = null
    stop()
    document.title = previous
    usePrintStore.getState().setPrint('none')
  }
  // Utskriften ritas först med bilden; sedan öppnas dialogen.
  await nextFrame()
  window.print()
}
