import { migrate } from '../persist/format'
import { ApiError, type PutResult, type SyncApi } from './api'
import { fromServer, type LocalRepo } from './localRepo'
import { prefetched } from './prefetch'

/** Hur många modeller (och bilder) som hämtas från servern samtidigt. */
export const PREFETCH = 6

export type SyncEvent =
  /** Vår ändring laddades upp. */
  | { kind: 'pushed'; id: string; revision: number }
  /** En annan enhet hade ändrat modellen. Serverns version ligger kvar under id; vår under copyId. */
  | { kind: 'conflict'; id: string; copyId: string; copyName: string }
  /** Modellen hämtades eller uppdaterades från servern. */
  | { kind: 'remote-update'; id: string; isNew: boolean }
  /** Modellen togs bort på en annan enhet. */
  | { kind: 'remote-delete'; id: string }
  /** Vi tog bort den, men den hade ändrats på en annan enhet; den finns kvar. */
  | { kind: 'delete-conflict'; id: string }
  /** Servern tog inte emot modellen (för stor, för många modeller). Den ligger kvar osynkad här. */
  | { kind: 'rejected'; id: string; name: string; reason: string }
  /** Servern har en modell i ett nyare format än den här versionen av appen kan läsa. */
  | { kind: 'incompatible'; id: string; name: string }
  /** Modellfilen på servern går inte att läsa. Kopian här (om den finns) ligger kvar orörd. */
  | { kind: 'unreadable'; id: string; name: string | null }

export interface SyncDeps {
  api: SyncApi
  repo: LocalRepo
  newId: () => string
  now?: () => Date
  /**
   * Kör fn ensam för modellen id, så att ingen annan flik sparar den mellan det att synken läser
   * och skriver den (se locks.ts). Utan lock körs fn direkt.
   */
  lock?: <T>(id: string, fn: () => Promise<T>) => Promise<T>
}

export interface SyncResult {
  events: SyncEvent[]
  /** Något behöver laddas upp i en runda till (t.ex. en konfliktkopia). */
  again: boolean
}

const stamp = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' })

export function conflictName(name: string, when: Date): string {
  return `${name} (konflikt ${stamp.format(when)})`
}

/**
 * En synkrunda: ladda upp lokala ändringar, hämta andras.
 *
 * Reglerna är skrivna så att inget kan försvinna tyst:
 * - Krock vid uppladdning: serverns version behålls under original-id, vår
 *   version sparas som en ny modell ("… (konflikt …)").
 * - Hämtning ersätter bara lokala modeller som inte har egna osynkade ändringar.
 * - Borttagning på servern tar bara bort lokala kopior utan osynkade ändringar;
 *   annars laddas vår version upp igen som ny.
 * Kastar ApiError om servern inte går att nå; då ändras ingenting lokalt.
 */
export async function syncOnce({
  api,
  repo,
  newId,
  now = () => new Date(),
  lock = (_id, fn) => fn(),
}: SyncDeps): Promise<SyncResult> {
  const events: SyncEvent[] = []
  let again = false

  // 1. Ladda upp.
  for (const m of await repo.list()) {
    if (m.deleted) {
      if (m.baseRevision === null) {
        await repo.remove(m.id)
        continue
      }
      const r = await api.delete(m.id, m.baseRevision)
      if (!r.ok && r.current) {
        await repo.put(fromServer(r.current))
        events.push({ kind: 'delete-conflict', id: m.id })
      } else await repo.remove(m.id)
      continue
    }
    if (!m.dirty) continue

    let r: PutResult
    try {
      r = await api.put(m.id, { name: m.name, baseRevision: m.baseRevision, file: m.file })
    } catch (e) {
      // En modell som servern nekar ska inte stoppa synken av de andra.
      if (!(e instanceof ApiError && e.kind === 'rejected')) throw e
      events.push({ kind: 'rejected', id: m.id, name: m.name, reason: e.message })
      continue
    }
    await lock(m.id, async () => {
      const latest = (await repo.get(m.id)) ?? m
      if (r.ok) {
        // Ändrades modellen lokalt medan vi laddade upp är den fortfarande osynkad.
        await repo.put({ ...latest, baseRevision: r.revision, dirty: latest.updatedAt !== m.updatedAt })
        events.push({ kind: 'pushed', id: m.id, revision: r.revision })
      } else if (!r.current) {
        // Borttagen på servern medan vi ändrade: ladda upp vår version som ny.
        await repo.put({ ...latest, baseRevision: null, dirty: true })
        again = true
      } else {
        const copyId = newId()
        const copyName = conflictName(latest.name, now())
        await repo.put({ ...latest, id: copyId, name: copyName, baseRevision: null, dirty: true })
        await repo.put(fromServer(r.current))
        events.push({ kind: 'conflict', id: m.id, copyId, copyName })
        again = true
      }
    })
  }

  // 2. Hämta.
  const remote = await api.list()
  const locals = new Map((await repo.list()).map((m) => [m.id, m]))
  for (const meta of remote)
    if (meta.broken) events.push({ kind: 'unreadable', id: meta.id, name: locals.get(meta.id)?.name ?? null })
  const wanted = remote.filter((meta) => {
    const local = locals.get(meta.id)
    if (meta.broken || local?.deleted || local?.dirty) return false
    return !local || (local.baseRevision ?? 0) < meta.revision
  })
  // Flera hämtningar på väg samtidigt: en ny enhet hämtar alla modeller, och en i taget
  // kostade en resa fram och tillbaka per modell innan appen kunde visas.
  for await (const [meta, full] of prefetched(wanted, PREFETCH, (meta) => api.get(meta.id))) {
    const local = locals.get(meta.id)
    if (!full) continue
    if (!migrate(full.file).ok) {
      events.push({ kind: 'incompatible', id: meta.id, name: meta.name })
      continue
    }
    const fetched = await lock(meta.id, async () => {
      // Kan ha ändrats lokalt under hämtningen.
      if ((await repo.get(meta.id))?.dirty) return false
      await repo.put(fromServer(full))
      return true
    })
    if (fetched) events.push({ kind: 'remote-update', id: meta.id, isNew: !local })
  }

  const remoteIds = new Set(remote.map((m) => m.id))
  for (const id of locals.keys()) {
    if (remoteIds.has(id)) continue
    await lock(id, async () => {
      // Läses om: en annan flik kan ha sparat den sedan listan lästes.
      const local = await repo.get(id)
      if (!local || local.deleted || local.baseRevision === null) return
      if (local.dirty) {
        await repo.put({ ...local, baseRevision: null })
        again = true
      } else {
        await repo.remove(id)
        events.push({ kind: 'remote-delete', id })
      }
    })
  }

  return { events, again }
}
