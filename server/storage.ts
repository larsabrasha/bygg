import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SavedFile } from '../src/persist/format'
import type { ModelMeta, ServerModel } from '../src/sync/protocol'
import { MODEL_ID_PATTERN } from '../src/sync/protocol'

export type PutResult = { ok: true; revision: number; updatedAt: string } | { ok: false; current: ServerModel | null }

export type DeleteResult = { ok: true } | { ok: false; current: ServerModel | null }

/**
 * Modeller som JSON-filer: <dataDir>/models/<id>.json. Borttagna flyttas till
 * <dataDir>/trash/ i stället för att raderas. Skrivningar är atomära (temp-fil +
 * rename) och köas per modell, så att två samtidiga anrop inte kan tappa en revision.
 */
export class FileStorage {
  private readonly modelsDir: string
  private readonly trashDir: string
  private readonly locks = new Map<string, Promise<unknown>>()

  constructor(
    dataDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.modelsDir = path.join(dataDir, 'models')
    this.trashDir = path.join(dataDir, 'trash')
  }

  async init() {
    await mkdir(this.modelsDir, { recursive: true })
    await mkdir(this.trashDir, { recursive: true })
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
    const names = await readdir(this.modelsDir)
    const metas: ModelMeta[] = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const m = await this.read(name.slice(0, -5)).catch(() => null)
      if (m) metas.push({ id: m.id, name: m.name, revision: m.revision, updatedAt: m.updatedAt })
    }
    return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
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
    const tmp = `${target}.${process.pid}.tmp`
    // Indenterad JSON: läsbar och diffbar vid felsökning och säkerhetskopiering.
    await writeFile(tmp, JSON.stringify(model, null, 2) + '\n', 'utf8')
    await rename(tmp, target)
  }

  /** Sparar om baseRevision stämmer med serverns (null = ny modell som inte får finnas). */
  put(id: string, name: string, baseRevision: number | null, file: SavedFile): Promise<PutResult> {
    return this.withLock(id, async () => {
      const current = await this.read(id)
      if ((current?.revision ?? null) !== baseRevision) return { ok: false, current }
      const model: ServerModel = {
        id,
        name,
        revision: (current?.revision ?? 0) + 1,
        updatedAt: this.now().toISOString(),
        file,
      }
      await this.write(model)
      return { ok: true, revision: model.revision, updatedAt: model.updatedAt }
    })
  }

  /** Flyttar modellen till papperskorgen om baseRevision stämmer. Redan borttagen räknas som klart. */
  delete(id: string, baseRevision: number): Promise<DeleteResult> {
    return this.withLock(id, async () => {
      const current = await this.read(id)
      if (!current) return { ok: true }
      if (current.revision !== baseRevision) return { ok: false, current }
      const stamp = this.now().toISOString().replace(/[:.]/g, '-')
      await rename(this.file(id), path.join(this.trashDir, `${id}-${stamp}.json`))
      return { ok: true }
    })
  }
}
