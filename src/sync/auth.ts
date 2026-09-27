import * as idb from 'idb-keyval'
import { selectGuest, selectUser } from './localStore'
import type { LoggedOutResponse, MeResponse } from './protocol'

/**
 * Inloggningen sett från appen. Servern sköter själva inloggningen (se server/auth.ts);
 * här tar appen reda på vem som är inloggad och väljer den användarens lokala lagring.
 * Säger servern att ingen är inloggad visas startsidan (src/landing) i stället för appen,
 * om man inte valt att köra utan konto: då sparas allt bara i webbläsaren.
 *
 * Offline går det att fortsätta med den användare som senast var inloggad här, men inte
 * efter att hen loggat ut: då vet appen inte vems modellerna är och visar startsidan.
 */

/** I standarddatabasen, bredvid bygg:owner: vem som senast var inloggad på enheten (se localStore). */
const LAST_USER = 'bygg:last-user'
/** Också i standarddatabasen: man har valt att köra utan konto. Tas bort när man loggar in. */
const GUEST = 'bygg:guest'

let me: MeResponse | null = import.meta.hot?.data.me ?? null
/** Om servern har inloggning. Bara en server som svarat login: false saknar den; utan kontakt antas den finnas. */
let loginOn: boolean = import.meta.hot?.data.loginOn ?? true

type MeResult = { kind: 'user'; me: MeResponse } | { kind: 'logged-out' } | { kind: 'unknown' }

async function fetchMe(): Promise<MeResult> {
  try {
    const r = await fetch('/auth/me', { headers: { accept: 'application/json' } })
    if (r.status === 401) {
      const body = (await r.json().catch(() => null)) as Partial<LoggedOutResponse> | null
      loginOn = body?.login !== false
      if (import.meta.hot) import.meta.hot.data.loginOn = loginOn
      return { kind: 'logged-out' }
    }
    // Utan server (statisk hosting) kommer index.html i stället för JSON.
    if (r.status !== 200 || !(r.headers.get('content-type') ?? '').includes('application/json'))
      return { kind: 'unknown' }
    return { kind: 'user', me: (await r.json()) as MeResponse }
  } catch {
    return { kind: 'unknown' }
  }
}

/** Adressen till inloggningen, med vägen tillbaka hit. */
export const loginUrl = () => `/auth/login?return=${encodeURIComponent(location.pathname + location.search)}`

/** Om det går att logga in. Annars finns bara läget utan konto, och ingen inloggning ska visas. */
export const canLogIn = () => loginOn

/** Inloggad användare, eller den som senast var inloggad här om servern inte svarar. */
export const currentUser = () => me

/** Från startsidan: kör appen utan konto. */
export async function startWithoutAccount() {
  await idb.set(GUEST, true).catch(() => {})
  location.assign('/')
}

/** Vid utloggning: nästa start offline ska inte öppna den här användarens modeller. */
export async function forgetUser() {
  await idb.del(LAST_USER).catch(() => {})
}

/**
 * Vid start, före allt som läser den lokala lagringen. 'landing' = ingen är inloggad och
 * man har inte valt att köra utan konto: visa startsidan. Utan kontakt med servern
 * fortsätter appen som sist, utan konto eller med den som senast var inloggad; finns
 * ingen sådan visas startsidan, så att inga modeller öppnas utan att man vet vems de är.
 */
export async function startAuth(): Promise<'app' | 'landing'> {
  const r = await fetchMe()
  const guest = r.kind !== 'user' && (await idb.get<boolean>(GUEST).catch(() => false)) === true
  if (guest) {
    me = null
    if (import.meta.hot) import.meta.hot.data.me = me
    selectGuest()
    return 'app'
  }
  if (r.kind === 'logged-out') return 'landing'
  if (r.kind === 'user') {
    me = r.me
    await idb.set(LAST_USER, me).catch(() => {})
    await idb.del(GUEST).catch(() => {})
  } else me = (await idb.get<MeResponse>(LAST_USER).catch(() => undefined)) ?? null
  if (import.meta.hot) import.meta.hot.data.me = me
  if (!me) return 'landing'
  await selectUser(me.sub)
  return 'app'
}
