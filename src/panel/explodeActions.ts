import { explodedCenter, explodeOffsets } from '../model/explode'
import { resolveBodies } from '../model/resolve'
import { captureView } from '../scene/viewCapture'
import { useDocumentStore } from '../store/documentStore'
import { usePrintStore } from '../store/printStore'
import { useViewStore } from '../store/viewStore'

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

  const print = usePrintStore.getState()
  print.setPrint('exploded', image)
  const previous = document.title
  document.title = `${modelName.replace(/[\\/:*?"<>|]/g, '').trim() || 'Modell'} – sprängskiss`
  window.addEventListener(
    'afterprint',
    () => {
      document.title = previous
      usePrintStore.getState().setPrint('cutlist')
    },
    { once: true },
  )
  // Utskriften ritas först med bilden; sedan öppnas dialogen.
  await nextFrame()
  window.print()
}
