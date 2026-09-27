/**
 * Ändringar som skickas ut direkt till användarens öppna appar (Server-Sent Events,
 * /api/events), så att det som CLI:t eller en annan enhet sparar syns utan att vänta
 * på nästa synk. Händelsen säger bara vad som ändrades; appen hämtar det med en vanlig
 * synkrunda, så att samma regler för krockar gäller.
 */

export type ChangeEvent =
  | { kind: 'model'; id: string; revision: number }
  | { kind: 'delete'; id: string }
  | { kind: 'catalog'; revision: number }

/** by: fliken som gjorde ändringen (x-bygg-client), så att den inte synkar i onödan. */
export type Listener = (event: ChangeEvent & { by?: string }) => void

/** Så många öppna strömmar får en användare ha (flikar och enheter). */
export const MAX_STREAMS_PER_USER = 20

export class ChangeHub {
  private readonly listeners = new Map<string, Set<Listener>>()

  /** Lyssnar på användarens ändringar. Null om hen redan har så många strömmar som hen får ha. */
  subscribe(sub: string, fn: Listener): (() => void) | null {
    const set = this.listeners.get(sub) ?? new Set()
    if (set.size >= MAX_STREAMS_PER_USER) return null
    set.add(fn)
    this.listeners.set(sub, set)
    return () => {
      set.delete(fn)
      if (set.size === 0) this.listeners.delete(sub)
    }
  }

  publish(sub: string, event: ChangeEvent, by?: string) {
    for (const fn of this.listeners.get(sub) ?? []) fn({ ...event, ...(by && { by }) })
  }

  count(sub: string): number {
    return this.listeners.get(sub)?.size ?? 0
  }
}
