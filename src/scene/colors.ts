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
/** X, Y, Z: samma färger i flyttpilarna som i axelkorset nere till vänster. */
export const AXIS_COLORS: [string, string, string] = ['#ff2060', '#20df80', '#2080ff']
export const ACCENT_LIGHT = '#7aa9e8'

/** Hur mycket större en pil är när pekaren eller strålen är på den. */
export const HOVER_SCALE = 1.2

/** En pil eller båge under pekaren: samma färg, ljusare (en del vitt inblandat). */
export function hoverColor(color: string): string {
  const n = parseInt(color.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * 0.45)
  const [r, g, b] = [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)]
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export const EDGE = '#5a4632'
/** Snäppmarkör på ett mål (annan dels kant, ytans kant). */
export const SNAP_ON_TARGET = '#d6336c'
/** Snäppmarkör på rutnätet. */
export const SNAP_GRID = '#8f8a80'

/**
 * Bakgrund och rutnät följer temat. Bakgrunden ska matcha --color-canvas i src/index.css.
 * studio: bakgrunden i det realistiska utseendet, som ett fotopapper. Den mörka är
 * ljusare än den vanliga, så att skuggan på golvet syns.
 */
export const SCENE = {
  light: { background: '#f2f1ee', studio: '#e6e3de', gridCell: '#c9c6bf', gridSection: '#8f8a80' },
  dark: { background: '#1b1a18', studio: '#3a3733', gridCell: '#45413b', gridSection: '#6b665d' },
}
