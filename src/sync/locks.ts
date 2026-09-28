/**
 * Lås som gäller alla flikar i webbläsaren (Web Locks), så att två flikar inte läser och skriver
 * samma modell i det lokala förrådet samtidigt, och inte synkar samtidigt. Utan Web Locks
 * (äldre webbläsare) en kö i den här fliken; då skyddar krockkontrollen i session.ts ändå.
 */

const queues = new Map<string, Promise<unknown>>()

export function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (locks) return locks.request(name, fn)
  const next = (queues.get(name) ?? Promise.resolve()).then(fn, fn)
  const tail = next.catch(() => {})
  queues.set(name, tail)
  void tail.then(() => {
    if (queues.get(name) === tail) queues.delete(name)
  })
  return next
}

/** Låset för en modell i det lokala förrådet. */
export const modelLock = (id: string) => `bygg:model:${id}`

/** Låset för en synkrunda. */
export const SYNC_LOCK = 'bygg:sync'
