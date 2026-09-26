import { useLibraryStore } from '../store/libraryStore'

/**
 * Pekskärm: filer delas (dela-menyn har AirDrop och Spara i Filer). Utan pekskärm
 * laddas de ner.
 */
export const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Delar filen på pekskärm, annars laddas den ner. Dela-menyn finns bara på https;
 * saknas den laddas filen ner. Safari vill att dela-menyn öppnas direkt efter ett
 * tryck: tog filen för lång tid att göra visas en knapp att trycka på i stället.
 */
export async function deliverFile(file: File): Promise<void> {
  if (!TOUCH || !navigator.canShare?.({ files: [file] })) return downloadFile(file)
  try {
    await navigator.share({ files: [file], title: file.name })
  } catch (e) {
    if (!(e instanceof DOMException)) throw e
    if (e.name === 'NotAllowedError') {
      const lib = useLibraryStore.getState()
      const id = lib.notify(`${file.name} är klar.`, {
        label: 'Dela',
        run: () => {
          lib.dismiss(id)
          void deliverFile(file)
        },
      })
    } else if (e.name !== 'AbortError') downloadFile(file)
  }
}
