import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { buildCutPlan, type CutPlan } from '../model/cutPlan'
import { cutPlanJob, type CutPlanJob } from '../model/cutPlanJob'
import type { Body, StockSettings } from '../model/types'

/**
 * Kapschemat räknas i en Web Worker: för en stor modell tar det hundratals millisekunder,
 * och med schemat öppet skulle varje ändring annars frysa appen så länge. Bara det senaste
 * jobbet räknas; ändrar man flera gånger medan ett räknas hoppas de emellan över.
 */

type Done = { key: string; plan: CutPlan }

let worker: Worker | null | undefined
/** Senast färdiga schemat: öppnas schemat igen utan ändringar visas det direkt. */
let last: Done | null = null
let running: { id: number; job: CutPlanJob } | null = null
let queued: CutPlanJob | null = null
let nextId = 0
const listeners = new Set<() => void>()

function finish(done: Done) {
  last = done
  listeners.forEach((l) => l())
}

function getWorker(): Worker | null {
  if (worker === undefined) {
    try {
      worker =
        typeof Worker === 'undefined'
          ? null
          : new Worker(new URL('./cutPlanWorker.ts', import.meta.url), { type: 'module' })
    } catch {
      worker = null
    }
    worker?.addEventListener('message', (e: MessageEvent<{ id: number; plan?: CutPlan; error?: string }>) => {
      const job = running?.id === e.data.id ? running.job : null
      running = null
      if (job) {
        if (e.data.plan) finish({ key: job.key, plan: e.data.plan })
        else console.error('[bygg] Kapschemat gick inte att räkna i workern', e.data.error)
      }
      send()
    })
  }
  return worker
}

function send() {
  const w = getWorker()
  if (!w || running || !queued) return
  running = { id: nextId++, job: queued }
  queued = null
  w.postMessage(running)
}

function request(job: CutPlanJob, bodies: readonly Body[], settings: StockSettings | undefined) {
  if (last?.key === job.key || running?.job.key === job.key) return
  // Utan worker (tester, gamla webbläsare): här och nu.
  if (!getWorker()) return finish({ key: job.key, plan: buildCutPlan(bodies, settings) })
  queued = job
  send()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

/**
 * Kapschemat för delarna. plan är det senast färdiga (null innan det första är klart);
 * stale = det hör till en äldre version av modellen och ett nytt räknas.
 */
export function useCutPlan(bodies: readonly Body[], settings: StockSettings | undefined) {
  const job = useMemo(() => cutPlanJob(bodies, settings), [bodies, settings])
  const done = useSyncExternalStore(subscribe, () => last)
  useEffect(() => {
    request(job, bodies, settings)
    // job ändras med bodies och settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job])
  return { plan: done?.plan ?? null, stale: done?.key !== job.key }
}
