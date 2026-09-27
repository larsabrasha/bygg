import * as idb from 'idb-keyval'
import type { UseStore } from 'idb-keyval'

/**
 * Den lokala lagringen (IndexedDB), en databas per användare: bygg-user-<id> för
 * den som är inloggad och bygg-guest utan konto. Modeller, bilder och
 * ångra-historik går via den här modulen, så att två användare i samma
 * webbläsare aldrig ser eller synkar varandras modeller.
 *
 * Standarddatabasen (idb-keyvals) har bara uppgifter om enheten: vem som äger
 * modellerna från före inloggningen, vem som senast var inloggad och om man valt
 * att köra utan konto (DEVICE_KEYS). Modellerna som låg där före inloggningen
 * flyttas till den första som loggar in, en gång.
 */

const OWNER_KEY = 'bygg:owner'
/** Nycklarna i standarddatabasen som hör till enheten och aldrig flyttas. */
export const DEVICE_KEYS: readonly string[] = [OWNER_KEY, 'bygg:last-user', 'bygg:guest']

// Behålls över HMR: annars skulle en ändring här tappa bort vilken databas som gäller.
let store: UseStore | null = import.meta.hot?.data.store ?? null
let userSub: string | null = import.meta.hot?.data.userSub ?? null
let guest: boolean = import.meta.hot?.data.guest ?? false

const keep = () => {
  if (import.meta.hot) Object.assign(import.meta.hot.data, { store, userSub, guest })
}

/** Databasen för en användare. */
export const userDb = (sub: string) => idb.createStore(`bygg-user-${sub}`, 'keyval')
export const guestDb = () => idb.createStore('bygg-guest', 'keyval')

/**
 * Flyttar modellerna från före inloggningen (standarddatabasen) till användarens
 * databas, om de hör till användaren: ingen ägde dem än, eller användaren äger dem.
 * En nyckel i taget, och bara om den inte redan finns hos användaren, så att en
 * flytt som avbröts kan göras om utan att skriva över något nyare.
 */
async function claimDeviceData(sub: string, target: UseStore) {
  const owner = await idb.get<string>(OWNER_KEY)
  if (owner !== undefined && owner !== sub) return
  if (owner === undefined) await idb.set(OWNER_KEY, sub)
  for (const key of await idb.keys()) {
    if (typeof key === 'string' && DEVICE_KEYS.includes(key)) continue
    if ((await idb.get(key, target)) === undefined) await idb.set(key, await idb.get(key), target)
    await idb.del(key)
  }
}

/** Väljer den inloggade användarens databas. */
export async function selectUser(sub: string) {
  const target = userDb(sub)
  await claimDeviceData(sub, target)
  store = target
  userSub = sub
  guest = false
  keep()
}

/** Utan konto: en egen databas, och ingen synk (se isGuest). */
export function selectGuest() {
  store = guestDb()
  userSub = null
  guest = true
  keep()
}

/** Sant utan konto: allt sparas bara i webbläsaren, och servern tillfrågas inte. */
export const isGuest = () => guest

/** Användaren som den lokala lagringen hör till, eller null. */
export const currentUserSub = () => userSub

/** Följer med varje anrop till API:t, så att servern kan säga nej om någon annan är inloggad. */
export const userHeader = (): Record<string, string> => (userSub === null ? {} : { 'x-bygg-user': userSub })

/** Databasen som gäller. Innan någon valts (selectUser, selectGuest) finns ingen, och då läses inget. */
function current(): UseStore {
  if (!store) throw new Error('Ingen användare vald för den lokala lagringen')
  return store
}

export const get = <T>(key: string) => idb.get<T>(key, current())
export const set = (key: string, value: unknown) => idb.set(key, value, current())
export const del = (key: string) => idb.del(key, current())
export const keys = () => idb.keys(current())
