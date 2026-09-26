/**
 * Vad handkontrollerna faktiskt rapporterade under en VR-session: profil,
 * layout och vilka knappar och spakar som användes. Visas som ett meddelande
 * när man lämnar VR, så att man ser om knapparna hamnade rätt (se VrRig) utan
 * att ha tillgång till konsolen i headsetet.
 */

interface HandReport {
  profiles: string[]
  mapping: string
  buttons: Set<number>
  axes: Set<number>
}

export interface VrReport {
  hands: Map<string, HandReport>
  /** Tiden för varje bildruta i sekunder (högst MAX_FRAMES, sedan räknas inte fler). */
  frames: number[]
}

export function newVrReport(): VrReport {
  return { hands: new Map(), frames: [] }
}

/** En kontroller i en bildruta. Knappar räknas när de trycks, spakar när de förs mer än halvvägs. */
export function recordSource(
  report: VrReport,
  handedness: string,
  profiles: readonly string[],
  gamepad: { mapping: string; buttons: readonly { pressed: boolean }[]; axes: readonly number[] },
) {
  let hand = report.hands.get(handedness)
  if (!hand) {
    hand = { profiles: [...profiles], mapping: gamepad.mapping, buttons: new Set(), axes: new Set() }
    report.hands.set(handedness, hand)
  }
  gamepad.buttons.forEach((b, i) => b.pressed && hand.buttons.add(i))
  gamepad.axes.forEach((a, i) => Math.abs(a) > 0.5 && hand.axes.add(i))
}

/** Tio minuter i 120 Hz. */
const MAX_FRAMES = 72_000
/**
 * Längre än så här är en paus, inte en långsam bildruta: den första bildrutan
 * (tiden räknas från senaste bilden i 3D-vyn, som bara ritar vid ändringar)
 * och när SteamVR-menyn är öppen. De räknas inte med.
 */
const PAUSE_S = 0.25
/** En bildruta mer än så här gånger längre än den vanliga är ett ryck. */
const HITCH = 1.5

export function recordFrame(report: VrReport, deltaSeconds: number) {
  if (report.frames.length < MAX_FRAMES) report.frames.push(deltaSeconds)
}

/** Bilder per sekund utan pauser, och hur många bildrutor som tog mer än HITCH gånger den vanliga tiden. */
export function frameStats(frames: readonly number[]): { fps: number; hitches: number } | null {
  const running = frames.filter((d) => d > 0 && d < PAUSE_S)
  if (running.length === 0) return null
  const median = [...running].sort((a, b) => a - b)[Math.floor(running.length / 2)]!
  const seconds = running.reduce((sum, d) => sum + d, 0)
  return { fps: Math.round(running.length / seconds), hitches: running.filter((d) => d > median * HITCH).length }
}

const HAND_NAMES: Record<string, string> = { left: 'Vänster', right: 'Höger', none: 'Okänd hand' }
const list = (s: Set<number>) => [...s].sort((a, b) => a - b).join(', ') || 'inga'

/** Texten i meddelandet, eller null om inga kontroller syntes. */
export function formatVrReport(report: VrReport): string | null {
  const stats = frameStats(report.frames)
  const rate = stats ? `${stats.fps} bilder/s, ${stats.hitches} ryck.` : ''
  const hands = [...report.hands.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([h, r]) =>
        `${HAND_NAMES[h] ?? h}: ${r.profiles[0] ?? 'ingen profil'}` +
        `${r.mapping === 'xr-standard' ? '' : ` (layout: ${r.mapping || 'okänd'})`}` +
        `, knappar ${list(r.buttons)}, spakar ${list(r.axes)}.`,
    )
  if (hands.length === 0) return stats ? `VR: inga handkontroller syntes. ${rate}` : null
  return `VR: ${rate} ${hands.join(' ')}`
}
