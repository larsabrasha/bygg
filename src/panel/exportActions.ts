import type { Body, ModelDocument } from '../model/types'
import { safeFileName } from '../model/cutlistExport'
import { MODEL_FILE_SUFFIX, modelFileJson } from '../persist/modelFile'

export type ExportFormat = 'bygg' | 'glb' | 'usdz' | 'obj' | 'stl' | '3mf'

/** Formaten i den ordning menyn visar dem, med vad de passar till. */
export const EXPORT_FORMATS: readonly { format: ExportFormat; label: string; hint: string }[] = [
  { format: 'bygg', label: 'Modellfil', hint: 'Öppnas i Bygg, allt kommer med' },
  { format: 'glb', label: 'GLB', hint: 'Blender, webben, Windows' },
  { format: 'usdz', label: 'USDZ', hint: 'iPhone, iPad och Mac, AR' },
  { format: 'obj', label: 'OBJ', hint: 'SketchUp, Fusion, Shapr3D (mm)' },
  { format: '3mf', label: '3MF', hint: '3D-skrivare, delarna var för sig' },
  { format: 'stl', label: 'STL', hint: '3D-skrivare, alla skrivarprogram' },
]

const TYPES: Record<ExportFormat, string> = {
  bygg: 'application/json',
  glb: 'model/gltf-binary',
  usdz: 'model/vnd.usdz+zip',
  obj: 'model/obj',
  stl: 'model/stl',
  '3mf': 'model/3mf',
}

/**
 * Filen i det valda formatet. 3D-exporten (three.js, manifold-3d och texturerna)
 * laddas först här, så att den inte gör appen tyngre att starta.
 */
export async function buildExportFile(
  format: ExportFormat,
  name: string,
  doc: ModelDocument,
  bodies: readonly Body[],
): Promise<File> {
  const base = safeFileName(name) || 'Modell'
  if (format === 'bygg') return new File([modelFileJson(name, doc)], base + MODEL_FILE_SUFFIX, { type: TYPES.bygg })

  const [{ loadArAssets, exportUsdz }, { loadManifold }, fileExport] = await Promise.all([
    import('../scene/arExport'),
    import('../scene/csg'),
    import('../scene/fileExport'),
  ])
  // Texturerna behövs bara i GLB och USDZ; manifold-3d i alla för hål och tappar.
  const textured = format === 'glb' || format === 'usdz'
  const assets = textured
    ? await loadArAssets(bodies)
    : { manifold: bodies.some((b) => b.tools) ? await loadManifold() : null }
  let data: BlobPart
  switch (format) {
    case 'glb':
      data = await fileExport.exportGlb(bodies, assets)
      break
    case 'usdz':
      data = await exportUsdz(bodies, assets)
      break
    case 'obj':
      data = fileExport.exportObj(bodies, assets)
      break
    case 'stl':
      data = fileExport.exportStl(bodies, assets)
      break
    case '3mf':
      data = fileExport.export3mf(bodies, assets, name)
      break
  }
  return new File([data], `${base}.${format}`, { type: TYPES[format] })
}
