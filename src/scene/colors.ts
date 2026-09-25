const WOOD: Record<string, string> = {
  furu: '#e3c28f',
  gran: '#ead7b0',
  ek: '#b98b57',
  björk: '#efdcb8',
  ask: '#d9c49e',
  plywood: '#d8b98a',
}

export function materialColor(material: string): string {
  return WOOD[material] ?? '#c8a878'
}

export const ACCENT = '#1e6fd9'
export const EDGE = '#5a4632'
