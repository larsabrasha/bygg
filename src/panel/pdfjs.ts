/**
 * pdf.js för PDF-visaren, laddad en gång. Den bakåtkompatibla versionen: den vanliga
 * använder funktioner som bara finns i allra nyaste webbläsarna (t.ex. Map.getOrInsert).
 * Ritningen börjar ladda den medan PDF:en skapas, så att visaren öppnas fortare.
 */
type Pdfjs = typeof import('pdfjs-dist')
let pdfjs: Promise<Pdfjs> | null = null

export function loadPdfjs(): Promise<Pdfjs> {
  pdfjs ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<Pdfjs>,
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default
    return lib
  })
  return pdfjs
}
