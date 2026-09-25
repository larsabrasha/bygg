import { migrate } from '../persist/format'
import type { SyncApi } from './api'
import { fromServer, type LocalRepo } from './localRepo'

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
  /** Servern har en modell i ett nyare format än den här versionen av appen kan läsa. */
  | { kind: 'incompatible'; id: string; name: string }

export interface SyncDeps {
  api: SyncApi
  repo: LocalRepo
  newId: () => string
  now?: () => Date
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
export async function syncOnce({ api, repo, newId, now = () => new Date() }: SyncDeps): Promise<SyncResult> {
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

    const r = await api.put(m.id, { name: m.name, baseRevision: m.baseRevision, file: m.file })
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
  }

  // 2. Hämta.
  const remote = await api.list()
  const locals = new Map((await repo.list()).map((m) => [m.id, m]))
  for (const meta of remote) {
    const local = locals.get(meta.id)
    if (local?.deleted || local?.dirty) continue
    if (local && (local.baseRevision ?? 0) >= meta.revision) continue
    const full = await api.get(meta.id)
    if (!full) continue
    if (!migrate(full.file).ok) {
      events.push({ kind: 'incompatible', id: meta.id, name: meta.name })
      continue
    }
    // Kan ha ändrats lokalt under hämtningen.
    if ((await repo.get(meta.id))?.dirty) continue
    await repo.put(fromServer(full))
    events.push({ kind: 'remote-update', id: meta.id, isNew: !local })
  }

  const remoteIds = new Set(remote.map((m) => m.id))
  for (const local of locals.values()) {
    if (local.deleted || local.baseRevision === null || remoteIds.has(local.id)) continue
    if (local.dirty) {
      await repo.put({ ...local, baseRevision: null })
      again = true
    } else {
      await repo.remove(local.id)
      events.push({ kind: 'remote-delete', id: local.id })
    }
  }

  return { events, again }
}
