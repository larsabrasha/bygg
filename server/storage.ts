import { mkdir, open, readdir, readFile, rename, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { SavedFile } from '../src/persist/format'
import type { Catalog } from '../src/model/catalog'
import type { ModelMeta, ServerCatalog, ServerModel, TrashItem } from '../src/sync/protocol'
import { MODEL_ID_PATTERN, TRASH_DAYS } from '../src/sync/protocol'
import { SUB_PATTERN } from './auth'

export type PutResult =
  | { ok: true; revision: number; updatedAt: string }
  | { ok: false; current: ServerModel | null }
  /** En ny modell, men användaren har redan så många som hen får ha. */
  | { ok: false; full: true }

export type PutCatalogResult =
  { ok: true; revision: number; updatedAt: string } | { ok: false; current: ServerCatalog | null }

export type DeleteResult = { ok: true } | { ok: false; current: ServerModel | null }

export type RestoreResult =
  | { ok: true; revision: number }
  /** Finns inte i papperskorgen (raderad för gott, eller redan tillbaka). */
  | { ok: false; missing: true }
  /** En modell med samma id finns redan bland modellerna. */
  | { ok: false; exists: true }
  /** Användaren har redan så många modeller som hen får ha. */
  | { ok: false; full: true }

/** En fil i papperskorgen: <id>-<tid>.json (och .png), där tiden är när den lades där. */
interface TrashEntry {
  id: string
  /** Filnamnet utan ändelse. */
  base: string
  deletedAt: Date
}

/** Tiden i ett filnamn i papperskorgen (toISOString med - i stället för : och .), eller null. */
export function trashTime(stamp: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(stamp)
  if (!m) return null
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Modeller som JSON-filer: <dataDir>/models/<id>.json, och bilden av varje modell
 * (till startvyn) i <dataDir>/thumbs/<id>.png. Borttagna flyttas till
 * <dataDir>/trash/ i stället för att raderas; där går de att ta tillbaka i TRASH_DAYS
 * dagar, sedan raderas de för gott. Skrivningar är atomära (temp-fil +
 * rename) och köas per modell, så att två samtidiga anrop inte kan tappa en revision.
 */
export class FileStorage {
  private readonly modelsDir: string
  private readonly trashDir: string
  private readonly thumbsDir: string
  private readonly catalogFile: string
  private readonly locks = new Map<string, Promise<unknown>>()
  /**
   * Namn och revision per fil, så att listan inte behöver läsa varje modell varje gång
   * (appen synkar när något ändras, se events.ts). En fil läses om när dess tid eller
   * storlek ändrats, så att också filer som ändrats utanför servern (en återställd
   * säkerhetskopia) syns.
   */
  private readonly metas = new Map<string, { mtimeMs: number; size: number; meta: ModelMeta | null }>()
  /** Namnet på varje modell i papperskorgen, per fil. Filerna där ändras aldrig. */
  private readonly trashNames = new Map<string, string | null>()

  constructor(
    dataDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.modelsDir = path.join(dataDir, 'models')
    this.trashDir = path.join(dataDir, 'trash')
    this.thumbsDir = path.join(dataDir, 'thumbs')
    this.catalogFile = path.join(dataDir, 'catalog.json')
  }

  /** Användarens material och färger, eller null om de aldrig sparats. */
  async getCatalog(): Promise<ServerCatalog | null> {
    try {
      return JSON.parse(await readFile(this.catalogFile, 'utf8')) as ServerCatalog
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }

  /** Sparar listan om baseRevision stämmer med serverns (null = ingen lista än). Samma kö som en modell. */
  putCatalog(baseRevision: number | null, catalog: Catalog): Promise<PutCatalogResult> {
    return this.withLock('catalog', async () => {
      const current = await this.getCatalog()
      if ((current?.revision ?? null) !== baseRevision) return { ok: false, current }
      const next: ServerCatalog = {
        revision: (current?.revision ?? 0) + 1,
        updatedAt: this.now().toISOString(),
        catalog,
      }
      await writeDurably(this.catalogFile, JSON.stringify(next, null, 2) + '\n')
      return { ok: true, revision: next.revision, updatedAt: next.updatedAt }
    })
  }

  async init() {
    await mkdir(this.modelsDir, { recursive: true })
    await mkdir(this.trashDir, { recursive: true })
    await mkdir(this.thumbsDir, { recursive: true })
  }

  private thumbFile(id: string) {
    if (!MODEL_ID_PATTERN.test(id)) throw new Error(`Ogiltigt modell-id: ${id}`)
    return path.join(this.thumbsDir, `${id}.png`)
  }

  /** Bilden av modellen, eller null om den saknas. */
  async getThumb(id: string): Promise<Buffer | null> {
    try {
      return await readFile(this.thumbFile(id))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }

  /** Sparar bilden av en modell som finns. Falskt om modellen inte finns. */
  putThumb(id: string, png: Uint8Array): Promise<boolean> {
    return this.withLock(id, async () => {
      if (!(await this.read(id))) return false
      await writeDurably(this.thumbFile(id), png)
      return true
    })
  }

  private file(id: string) {
    if (!MODEL_ID_PATTERN.test(id)) throw new Error(`Ogiltigt modell-id: ${id}`)
    return path.join(this.modelsDir, `${id}.json`)
  }

  /** Kör fn när tidigare operationer på samma id är klara. */
  private withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    this.locks.set(
      id,
      next.catch(() => {}),
    )
    return next
  }

  async list(): Promise<ModelMeta[]> {
    const names = (await readdir(this.modelsDir)).filter((n) => n.endsWith('.json'))
    const metas: ModelMeta[] = []
    for (const name of names) {
      const info = await stat(path.join(this.modelsDir, name)).catch(() => null)
      if (!info) continue
      let hit = this.metas.get(name)
      if (!hit || hit.mtimeMs !== info.mtimeMs || hit.size !== info.size) {
        const id = name.slice(0, -5)
        hit = { mtimeMs: info.mtimeMs, size: info.size, meta: await this.readMeta(id, info.mtime) }
        this.metas.set(name, hit)
      }
      if (hit.meta) metas.push(hit.meta)
    }
    const present = new Set(names)
    for (const name of this.metas.keys()) if (!present.has(name)) this.metas.delete(name)
    return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /**
   * Namn och revision ur filen. Går den inte att läsa står den ändå i listan, som trasig:
   * saknades den där skulle klienterna tro att den tagits bort och radera sina kopior.
   * Null bara om filen försvunnit sedan mappen lästes, eller om namnet inte är ett modell-id.
   */
  private async readMeta(id: string, mtime: Date): Promise<ModelMeta | null> {
    if (!MODEL_ID_PATTERN.test(id)) return null
    try {
      const m = await this.read(id)
      if (!m) return null
      if (typeof m.name === 'string' && Number.isInteger(m.revision) && typeof m.updatedAt === 'string')
        return { id, name: m.name, revision: m.revision, updatedAt: m.updatedAt }
    } catch (e) {
      console.warn(`[bygg] ${this.file(id)} går inte att läsa`, e)
    }
    return { id, name: '(går inte att läsa)', revision: 0, updatedAt: mtime.toISOString(), broken: true }
  }

  async get(id: string): Promise<ServerModel | null> {
    return this.read(id)
  }

  private async read(id: string): Promise<ServerModel | null> {
    try {
      return JSON.parse(await readFile(this.file(id), 'utf8')) as ServerModel
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }

  private async write(model: ServerModel) {
    const target = this.file(model.id)
    // Indenterad JSON: läsbar och diffbar vid felsökning och säkerhetskopiering.
    await writeDurably(target, JSON.stringify(model, null, 2) + '\n')
    // Egna skrivningar läses om nästa gång, även om tiden inte hunnit ändras.
    this.metas.delete(path.basename(target))
  }

  /** Antal modeller (utan papperskorgen). */
  async count(): Promise<number> {
    return (await readdir(this.modelsDir)).filter((n) => n.endsWith('.json')).length
  }

  /**
   * Sparar om baseRevision stämmer med serverns (null = ny modell som inte får finnas).
   * En ny modell sparas bara om det finns färre än maxModels; nya modeller skapas en i taget,
   * så att två samtidiga anrop inte båda får den sista platsen.
   */
  put(
    id: string,
    name: string,
    baseRevision: number | null,
    file: SavedFile,
    maxModels = Infinity,
  ): Promise<PutResult> {
    const save = () => this.withLock(id, () => this.save(id, name, baseRevision, file, maxModels))
    return baseRevision === null ? this.withLock('create', save) : save()
  }

  private async save(
    id: string,
    name: string,
    baseRevision: number | null,
    file: SavedFile,
    maxModels: number,
  ): Promise<PutResult> {
    const current = await this.read(id)
    if ((current?.revision ?? null) !== baseRevision) return { ok: false, current }
    if (!current && (await this.count()) >= maxModels) return { ok: false, full: true }
    const model: ServerModel = {
      id,
      name,
      revision: (current?.revision ?? 0) + 1,
      updatedAt: this.now().toISOString(),
      file,
    }
    await this.write(model)
    return { ok: true, revision: model.revision, updatedAt: model.updatedAt }
  }

  /** Flyttar modellen till papperskorgen om baseRevision stämmer. Redan borttagen räknas som klart. */
  delete(id: string, baseRevision: number): Promise<DeleteResult> {
    return this.withLock(id, async () => {
      const current = await this.read(id)
      if (!current) return { ok: true }
      if (current.revision !== baseRevision) return { ok: false, current }
      const stamp = this.now().toISOString().replace(/[:.]/g, '-')
      await rename(this.file(id), path.join(this.trashDir, `${id}-${stamp}.json`))
      await rename(this.thumbFile(id), path.join(this.trashDir, `${id}-${stamp}.png`)).catch(() => {})
      return { ok: true }
    })
  }

  /** Filerna i papperskorgen, senast borttagna först. Filer med ett namn som inte går att läsa hoppas över. */
  private async trashEntries(): Promise<TrashEntry[]> {
    const entries: TrashEntry[] = []
    for (const name of await readdir(this.trashDir)) {
      if (!name.endsWith('.json')) continue
      const base = name.slice(0, -5)
      const id = base.slice(0, 36)
      const deletedAt = trashTime(base.slice(37))
      if (!MODEL_ID_PATTERN.test(id) || base[36] !== '-' || !deletedAt) continue
      entries.push({ id, base, deletedAt })
    }
    return entries.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime())
  }

  private async removeTrashEntry(e: TrashEntry) {
    for (const ext of ['.json', '.png'])
      await unlink(path.join(this.trashDir, e.base + ext)).catch((err: unknown) => {
        if (!isMissing(err)) throw err
      })
    this.trashNames.delete(e.base)
  }

  /**
   * Raderar för gott det som legat i papperskorgen i mer än TRASH_DAYS dagar. Returnerar hur många.
   * Samma modell kan ligga där flera gånger (borttagen, uppladdad igen, borttagen); varje fil för sig.
   */
  async purgeOldTrash(): Promise<number> {
    const limit = this.now().getTime() - TRASH_DAYS * DAY_MS
    let n = 0
    for (const e of await this.trashEntries()) {
      if (e.deletedAt.getTime() > limit) continue
      await this.withLock(e.id, () => this.removeTrashEntry(e))
      n++
    }
    return n
  }

  /** Modellerna i papperskorgen, senast borttagna först; en gång per modell, den senaste. Rensar först. */
  async listTrash(): Promise<TrashItem[]> {
    await this.purgeOldTrash()
    const seen = new Set<string>()
    const items: TrashItem[] = []
    for (const e of await this.trashEntries()) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      let name = this.trashNames.get(e.base)
      if (name === undefined) {
        const raw = await readFile(path.join(this.trashDir, `${e.base}.json`), 'utf8').catch(() => null)
        try {
          name = raw === null ? null : ((JSON.parse(raw) as ServerModel).name ?? null)
        } catch {
          name = null
        }
        this.trashNames.set(e.base, name)
      }
      if (name !== null) items.push({ id: e.id, name, deletedAt: e.deletedAt.toISOString() })
    }
    return items
  }

  /** Bilden av en modell i papperskorgen (den senaste gången den lades där), eller null. */
  async getTrashThumb(id: string): Promise<Buffer | null> {
    const e = (await this.trashEntries()).find((x) => x.id === id)
    if (!e) return null
    return readFile(path.join(this.trashDir, `${e.base}.png`)).catch((err: unknown) => {
      if (isMissing(err)) return null
      throw err
    })
  }

  /**
   * Tar tillbaka modellen ur papperskorgen, med samma id och revision som när den togs bort,
   * så att enheter som har den kvar lokalt känner igen den. Äldre filer för samma modell raderas.
   * Räknas som en ny modell mot maxModels, och skapas i samma kö som nya modeller.
   */
  restore(id: string, maxModels = Infinity): Promise<RestoreResult> {
    return this.withLock('create', () =>
      this.withLock(id, async (): Promise<RestoreResult> => {
        const entries = (await this.trashEntries()).filter((e) => e.id === id)
        const latest = entries[0]
        if (!latest) return { ok: false, missing: true }
        if (await this.read(id)) return { ok: false, exists: true }
        if ((await this.count()) >= maxModels) return { ok: false, full: true }
        const raw = JSON.parse(await readFile(path.join(this.trashDir, `${latest.base}.json`), 'utf8')) as ServerModel
        await rename(path.join(this.trashDir, `${latest.base}.json`), this.file(id))
        await rename(path.join(this.trashDir, `${latest.base}.png`), this.thumbFile(id)).catch((err: unknown) => {
          if (!isMissing(err)) throw err
        })
        this.trashNames.delete(latest.base)
        this.metas.delete(`${id}.json`)
        for (const e of entries.slice(1)) await this.removeTrashEntry(e)
        return { ok: true, revision: raw.revision }
      }),
    )
  }

  /** Raderar modellen ur papperskorgen för gott, alla gånger den lagts där. Falskt om den inte fanns där. */
  purgeTrash(id: string): Promise<boolean> {
    if (!MODEL_ID_PATTERN.test(id)) return Promise.reject(new Error(`Ogiltigt modell-id: ${id}`))
    return this.withLock(id, async () => {
      const entries = (await this.trashEntries()).filter((e) => e.id === id)
      for (const e of entries) await this.removeTrashEntry(e)
      return entries.length > 0
    })
  }
}

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT'

/**
 * Skriver filen via en temp-fil som flyttas på plats (atomärt), och ser till att både filen och
 * flytten ligger på disken innan svaret går (fsync). Utan det kan ett strömavbrott lämna en tom
 * eller halv fil, trots att klienten fått veta att sparningen gick bra.
 */
async function writeDurably(target: string, data: string | Uint8Array) {
  const tmp = `${target}.${process.pid}.tmp`
  const file = await open(tmp, 'w')
  try {
    await file.writeFile(data)
    await file.sync()
  } finally {
    await file.close()
  }
  await rename(tmp, target)
  // Mappen också, så att flytten finns kvar efter ett avbrott. Går inte på alla system (Windows).
  const dir = await open(path.dirname(target), 'r').catch(() => null)
  if (dir)
    await dir
      .sync()
      .catch(() => {})
      .finally(() => dir.close())
}

/**
 * En FileStorage per användare, i <dataDir>/users/<sub>/. Samma instans varje gång,
 * så att köerna per modell gäller alla anrop för användaren.
 *
 * Modellerna från före inloggningen (<dataDir>/models, thumbs, trash) flyttas till
 * den första användare som loggar in, en gång.
 */
export class UserStorages {
  private readonly storages = new Map<string, Promise<FileStorage>>()
  private claiming: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly dataDir: string,
    private readonly now?: () => Date,
  ) {}

  for(sub: string): Promise<FileStorage> {
    if (!SUB_PATTERN.test(sub)) return Promise.reject(new Error(`Ogiltigt användar-id: ${sub}`))
    let s = this.storages.get(sub)
    if (!s) {
      s = this.open(sub)
      this.storages.set(sub, s)
      s.catch(() => this.storages.delete(sub))
    }
    return s
  }

  /** Raderar det som legat för länge i papperskorgen, för alla användare. Returnerar hur många. */
  async purgeOldTrash(): Promise<number> {
    const users = await readdir(path.join(this.dataDir, 'users')).catch((e: unknown) => {
      if (isMissing(e)) return []
      throw e
    })
    let n = 0
    for (const sub of users) if (SUB_PATTERN.test(sub)) n += await (await this.for(sub)).purgeOldTrash()
    return n
  }

  private async open(sub: string) {
    const dir = path.join(this.dataDir, 'users', sub)
    // En i taget, så att två nya användare inte båda tar de gamla modellerna.
    const claim = this.claiming.then(() => this.claimLegacy(dir, sub))
    this.claiming = claim.catch(() => {})
    await claim
    const storage = new FileStorage(dir, this.now)
    await storage.init()
    return storage
  }

  private async claimLegacy(dir: string, sub: string) {
    const users = await readdir(path.join(this.dataDir, 'users')).catch((e: unknown) => {
      if (isMissing(e)) return []
      throw e
    })
    if (users.length > 0) return
    const legacy: string[] = []
    for (const name of ['models', 'thumbs', 'trash']) {
      const exists = await stat(path.join(this.dataDir, name)).then(
        (s) => s.isDirectory(),
        (e: unknown) => {
          if (isMissing(e)) return false
          throw e
        },
      )
      if (exists) legacy.push(name)
    }
    if (legacy.length === 0) return
    await mkdir(dir, { recursive: true })
    for (const name of legacy) await rename(path.join(this.dataDir, name), path.join(dir, name))
    console.log(`[bygg] Modellerna från före inloggningen flyttades till användaren ${sub}.`)
  }
}
