import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { specOf } from '../src/model/catalog'
import { LIMITS } from '../src/model/limits'
import { MATERIAL_SPECS, setCustomMaterials, type MaterialSpec } from '../src/model/materials'
import type { ModelDocument } from '../src/model/types'
import { migrate, serialize } from '../src/persist/format'
import { MODEL_FILE_SUFFIX, modelFileJson, nameFromFileName, readModelFile } from '../src/persist/modelFile'
import { emptyDocument } from '../src/store/documentStore'
import type { ModelMeta } from '../src/sync/protocol'
import { MODEL_ID_PATTERN } from '../src/sync/protocol'
import { CliError, configFile, httpClient, normalizeServer, readConfig, writeConfig, type Api } from './client'
import { cutListJson, cutListText, cutPlanJson, cutPlanText, summarize, summaryText } from './describe'
import { applyOps, MAX_COPY_COUNT, MAX_OPS } from './ops'

/** Så stor får en fil med operationer eller en modellfil vara. */
const MAX_INPUT_BYTES = 4 * 1024 * 1024

export const HELP = `bygg – CLI för Bygg (möbler i 3D med kaplista)

Användning: bygg <kommando> [argument] [flaggor]

Konto
  login [--server URL]      Logga in: skapa en nyckel på <server>/auth/cli och klistra in den.
                            Mot dev-servern (localhost) behövs ingen nyckel.
  logout                    Ta bort nyckeln på servern och i den här datorn.
  whoami                    Vem du är inloggad som, och hur många modeller du har.
  limits                    Gränserna för modeller och anrop.

Modeller (<modell> = id, början på ett id, namnet, eller en lokal fil som slutar på .json)
  list                      Dina modeller.
  show <modell>             Delarna med id, mått och läge.
  cutlist <modell>          Kaplistan (L × B × T i varje dels egen riktning).
  cutplan <modell>          Kapschemat: vad som ska köpas och hur det kapas.
  new <namn> [--file F]     Ny tom modell på servern, eller i filen F.
  edit <modell> [F|-]       Ändra med operationer (JSON-lista) från filen F, stdin eller --ops '…'.
                            --dry-run visar resultatet utan att spara. --show visar modellen efteråt.
  import <fil> [--name N]   Lägg upp en modellfil (.bygg.json) på servern.
  export <modell> [-o F]    Modellen som .bygg.json (samma fil som Dela → Bygg-fil i appen).
  rename <modell> <namn>
  delete <modell> --yes     Flytta modellen till serverns papperskorg.
  materials                 Material att välja mellan (inbyggda och dina egna).
  ops                       Alla operationer för edit, med exempel.

Flaggor: --json (maskinläsbart), --server URL, --force (skriv över en fil).
Miljö: BYGG_SERVER, BYGG_TOKEN. Inställningar: ${configFile()}`

export const OPS_HELP = `Operationer för bygg edit: en JSON-lista, som körs i ordning. Allt eller inget:
stoppas en operation sparas ingenting.

Mått i mm. Världen: x åt höger, y uppåt, z framåt (mot betraktaren). Golvet är y = 0.
Tal kan vara uttryck med parametrar: "bredd - 2 * tjocklek". Mått och lägen som är
uttryck sparas som uttryck och följer parametern.
"id" kan vara ett id, början på ett (minst 4 tecken), delens namn om bara en del heter så,
eller en "ref" som en tidigare operation i samma lista satte.

  {"op":"param","name":"bredd","expr":800}                 ny parameter, eller ändra den
  {"op":"deleteParam","name":"bredd"}
  {"op":"box","name":"Skiva","size":[800,22,450],"at":[0,700,0],"material":"ek",
   "grain":"x","ref":"skiva"}                              låda; at = hörnet närmast origo
  {"op":"cylinder","name":"Pinne","diameter":20,"length":400,"axis":"x","at":[0,0,0]}
  {"op":"copy","id":"ben","by":[755,0,0],"count":1,"ref":"ben2"}   länkad kopia (delar form)
  {"op":"copy","id":"hylla","by":[0,300,0],"count":3,"refs":["h2","h3","h4"]}
  {"op":"copy","id":"ben","at":[755,0,405]}                kopia med hörnet i at
  {"op":"move","id":"ben2","by":[10,0,0]}  eller  "to":[x,y,z]
  {"op":"position","id":"ben2","x":"bredd - 45"}           läge längs en axel, som uttryck
  {"op":"size","id":"skiva","x":"bredd","z":450}           mått längs världsaxlar (alla länkade kopior)
  {"op":"rotate","id":"ben","axis":"y","degrees":90}      runt delens mitt
  {"op":"set","id":"skiva","name":"Bordsskiva","material":"björkplywood","grain":"z",
   "thickness":"y","paint":"#f2efe8"}                       paint: "#rrggbb", {"color","code"} eller null
  {"op":"unique","id":"ben2"}                               egen form, inte längre länkad
  {"op":"subtract","tool":"hål","host":"skiva"}            verktyget skärs ur värden (urtag)
  {"op":"add","tool":"list","host":"skiva"}                verktyget sitter på värden
  {"op":"joint","host":"sarg","into":"ben"}                tapp från sargen in i benet, med tapphål
  {"op":"detach","id":"hål"}                                verktyget blir en vanlig del igen
  {"op":"delete","id":"ben2"}                               tar också bort delens verktyg
  {"op":"stock","kerf":3,"allowance":10}                   sågblad och kapmån för kapschemat

grain = axeln längs fibern (kaplistans L), thickness = tjockleken (T). Utan dem gissas de från måtten.
"by" och "at" i copy och move räknas ut en gång. Ska läget följa en parameter: använd position.
Högst ${MAX_OPS} operationer åt gången och ${MAX_COPY_COUNT} kopior per copy.`

const limitsText = () =>
  [
    `Modeller per konto: ${LIMITS.models}`,
    `Per modell: ${LIMITS.instances} delar (verktyg inräknade), ${LIMITS.sketches} skisser, ${LIMITS.params} parametrar,`,
    `  ${LIMITS.materials} egna material, lagermått för ${LIMITS.stockGroups} grupper (${LIMITS.stockSizes} per grupp)`,
    `Namn högst ${LIMITS.nameLength} tecken, uttryck högst ${LIMITS.exprLength} tecken`,
    `Allt inom ${LIMITS.extent / 1000} m från origo`,
    `Per edit: ${MAX_OPS} operationer, ${MAX_COPY_COUNT} kopior per copy`,
  ].join('\n')

export interface Io {
  out: (text: string) => void
  err: (text: string) => void
  /** Hela stdin som text. */
  readStdin: () => Promise<string>
  stdinIsTty: boolean
  env: NodeJS.ProcessEnv
  /** Bara i tester: egen klient i stället för http mot servern. */
  api?: (server: string, token: string | undefined) => Api
  openBrowser?: (url: string) => void
}

const isLocal = (ref: string) => /\.json$/i.test(ref)

async function readLimited(file: string): Promise<string> {
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) throw new CliError(`Filen ${file} finns inte`)
  if (info.size > MAX_INPUT_BYTES) throw new CliError(`${file} är större än ${MAX_INPUT_BYTES / 1024 / 1024} MB`)
  return readFile(file, 'utf8')
}

async function writeNew(file: string, text: string, force: boolean) {
  if (!force && (await stat(file).catch(() => null))) throw new CliError(`${file} finns redan (--force skriver över)`)
  await writeFile(file, text, 'utf8')
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new CliError(`${what} är inte giltig JSON: ${(e as Error).message}`)
  }
}

interface Loaded {
  name: string
  doc: ModelDocument
  /** På servern: id och revisionen modellen lästes i. */
  remote?: { id: string; revision: number }
  file?: string
}

export async function run(argv: string[], io: Io): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        server: { type: 'string' },
        json: { type: 'boolean' },
        file: { type: 'string' },
        out: { type: 'string', short: 'o' },
        name: { type: 'string' },
        ops: { type: 'string' },
        yes: { type: 'boolean' },
        force: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        show: { type: 'boolean' },
        'no-browser': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (e) {
    io.err(`${(e as Error).message}\nSe bygg help.`)
    return 2
  }
  const { values: flags, positionals } = parsed
  const [command = 'help', ...args] = positionals
  const json = (x: unknown) => io.out(JSON.stringify(x, null, 2))

  const config = await readConfig(configFile(io.env))
  const server = () => {
    const raw = flags.server ?? io.env.BYGG_SERVER ?? config.server
    if (!raw) throw new CliError('Ingen server. Kör bygg login --server https://… eller sätt BYGG_SERVER.')
    return normalizeServer(raw)
  }
  // Nyckeln hör till servern den skapades på; den skickas aldrig till en annan.
  const token = (url: string) =>
    io.env.BYGG_TOKEN || (config.server && normalizeServer(config.server) === url ? config.token : undefined)
  const makeApi = io.api ?? ((url, t) => httpClient(url, t))
  const api = () => {
    const url = server()
    return makeApi(url, token(url))
  }

  /** Modellens meta på servern, efter id, början på id eller namn. */
  async function findRemote(a: Api, ref: string): Promise<ModelMeta> {
    const list = await a.list()
    const exact = list.find((m) => m.id === ref)
    if (exact) return exact
    const prefix = ref.length >= 4 ? list.filter((m) => m.id.startsWith(ref)) : []
    if (prefix.length === 1) return prefix[0]!
    const named = list.filter((m) => m.name === ref)
    const lower = named.length ? named : list.filter((m) => m.name.toLowerCase() === ref.toLowerCase())
    if (lower.length === 1) return lower[0]!
    if (prefix.length > 1 || lower.length > 1)
      throw new CliError(
        `"${ref}" passar på flera modeller: ${[...prefix, ...lower].map((m) => `${m.id.slice(0, 8)} ${m.name}`).join(', ')}`,
      )
    throw new CliError(`Ingen modell "${ref}". Se bygg list.`)
  }

  async function load(ref: string | undefined, a?: Api): Promise<Loaded> {
    if (!ref) throw new CliError('Ange en modell (id, namn eller fil). Se bygg list.')
    if (isLocal(ref)) {
      const r = readModelFile(await readLimited(ref), nameFromFileName(ref.split('/').at(-1)!))
      if (!r.ok) throw new CliError(`${ref}: ${r.reason}`)
      return { name: r.name, doc: r.doc, file: ref }
    }
    const client = a ?? api()
    const meta = await findRemote(client, ref)
    const m = await client.get(meta.id)
    if (!m) throw new CliError(`Modellen ${meta.id} finns inte längre`)
    const r = migrate(m.file)
    if (!r.ok) throw new CliError(`${m.name}: ${r.reason}`)
    return { name: m.name, doc: r.doc, remote: { id: m.id, revision: m.revision } }
  }

  /** Egna material (listan på servern och modellens kopior), så att de känns igen i edit och kaplistan. */
  async function loadMaterials(doc: ModelDocument, a?: Api) {
    const catalog = a ? await a.catalog() : null
    const own: MaterialSpec[] = [...(catalog?.materials.map(specOf) ?? []), ...(doc.materials ?? [])]
    setCustomMaterials(own)
    return own
  }

  async function save(loaded: Loaded, doc: ModelDocument, a: Api | undefined, name = loaded.name) {
    if (loaded.file) {
      await writeFile(loaded.file, modelFileJson(name, doc), 'utf8')
      return { file: loaded.file }
    }
    const { id, revision } = loaded.remote!
    const r = await a!.put(id, { name, baseRevision: revision, file: serialize(doc) })
    if (!r.ok)
      throw new CliError(
        r.current
          ? `Modellen ändrades (revision ${r.current.revision}) medan du arbetade. Inget sparades; kör igen.`
          : 'Modellen har tagits bort på servern. Inget sparades.',
      )
    return { id, revision: r.res.revision }
  }

  try {
    if (flags.help) {
      io.out(command === 'edit' || command === 'ops' ? OPS_HELP : HELP)
      return 0
    }
    switch (command) {
      case 'help':
        io.out(args[0] === 'edit' || args[0] === 'ops' ? OPS_HELP : HELP)
        return 0
      case 'ops':
        io.out(OPS_HELP)
        return 0
      case 'limits': {
        if (flags.json) json({ limits: LIMITS, edit: { maxOps: MAX_OPS, maxCopies: MAX_COPY_COUNT } })
        else io.out(limitsText())
        return 0
      }
      case 'login': {
        const url = normalizeServer(flags.server ?? io.env.BYGG_SERVER ?? config.server ?? 'http://localhost:5173')
        const anon = makeApi(url, undefined)
        const me = await anon.authMe()
        if (me?.dev) {
          await writeConfig({ server: url }, configFile(io.env))
          io.out(`${url} är en dev-server: ingen nyckel behövs. Sparat som server.`)
          return 0
        }
        const page = `${url}/auth/cli`
        io.err(`Öppna ${page}, skapa en nyckel och klistra in den här (Enter):`)
        if (!flags['no-browser']) (io.openBrowser ?? openBrowser)(page)
        const pasted = (await io.readStdin()).trim().split(/\s+/)[0] ?? ''
        if (!pasted) throw new CliError('Ingen nyckel')
        const who = await makeApi(url, pasted).me()
        await writeConfig({ server: url, token: pasted }, configFile(io.env))
        io.out(`Inloggad som ${who.name} på ${url}.`)
        return 0
      }
      case 'logout': {
        const url = server()
        const t = token(url)
        if (t) await makeApi(url, t).logout()
        await writeConfig({ server: config.server }, configFile(io.env))
        io.out(t ? 'Nyckeln är borttagen.' : 'Ingen nyckel var sparad.')
        if (io.env.BYGG_TOKEN) io.err('BYGG_TOKEN är fortfarande satt i miljön.')
        return 0
      }
      case 'whoami': {
        const me = await api().me()
        if (flags.json) json(me)
        else io.out(`${me.name} (${me.sub}) på ${server()}, ${me.models} av ${me.limits.models} modeller.`)
        return 0
      }
      case 'list': {
        const list = await api().list()
        if (flags.json) json(list)
        else if (list.length === 0) io.out('Inga modeller.')
        else {
          for (const m of list) io.out(`${m.id.slice(0, 8)}  ${m.updatedAt.slice(0, 16).replace('T', ' ')}  ${m.name}`)
          io.out(`${list.length} av ${LIMITS.models} modeller.`)
        }
        return 0
      }
      case 'materials': {
        const own =
          config.server || io.env.BYGG_SERVER || flags.server ? await loadMaterials(emptyDocument(), api()) : []
        const all = [...MATERIAL_SPECS.map((m) => ({ ...m, own: false })), ...own.map((m) => ({ ...m, own: true }))]
        if (flags.json) json(all.map(({ id, name, kind, grain, own: o }) => ({ id, name, kind, grain, own: o })))
        else
          for (const m of all)
            io.out(
              `${m.id.padEnd(16)} ${m.name}  (${{ wood: 'massivt trä', sheet: 'skiva', ordered: 'till mått' }[m.kind]}${m.own ? ', eget' : ''})`,
            )
        return 0
      }
      case 'show':
      case 'cutlist':
      case 'cutplan': {
        const a = isLocal(args[0] ?? '') ? undefined : api()
        const m = await load(args[0], a)
        await loadMaterials(m.doc, a)
        if (command === 'show') {
          const s = summarize(m.name, m.doc)
          if (flags.json) json({ ...(m.remote && { id: m.remote.id, revision: m.remote.revision }), ...s })
          else io.out((m.remote ? `${m.remote.id} (revision ${m.remote.revision})\n` : '') + summaryText(s))
        } else if (command === 'cutlist') {
          if (flags.json) json(cutListJson(m.doc))
          else io.out(cutListText(m.doc))
        } else if (flags.json) json(cutPlanJson(m.doc))
        else io.out(cutPlanText(m.doc))
        return 0
      }
      case 'new': {
        const name = args[0]?.trim()
        if (!name) throw new CliError('Ange ett namn: bygg new "Bord"')
        if (name.length > LIMITS.nameLength) throw new CliError(`Namnet får vara högst ${LIMITS.nameLength} tecken`)
        if (flags.file) {
          if (!isLocal(flags.file)) throw new CliError(`Filen ska sluta på ${MODEL_FILE_SUFFIX}`)
          await writeNew(flags.file, modelFileJson(name, emptyDocument()), !!flags.force)
          io.out(flags.json ? JSON.stringify({ file: flags.file }) : `Skapade ${flags.file}.`)
          return 0
        }
        return await create(api(), name, emptyDocument())
      }
      case 'import': {
        const file = args[0]
        if (!file) throw new CliError('Ange en fil: bygg import bord.bygg.json')
        const r = readModelFile(await readLimited(file), nameFromFileName(file.split('/').at(-1)!))
        if (!r.ok) throw new CliError(`${file}: ${r.reason}`)
        return await create(api(), flags.name?.trim() || r.name, r.doc)
      }
      case 'export': {
        const m = await load(args[0])
        const text = modelFileJson(m.name, m.doc)
        if (flags.out) {
          await writeNew(flags.out, text, !!flags.force)
          io.out(`Sparade ${flags.out}.`)
        } else io.out(text)
        return 0
      }
      case 'rename': {
        const name = args[1]?.trim()
        if (!name) throw new CliError('Ange det nya namnet: bygg rename <modell> "Nytt namn"')
        if (name.length > LIMITS.nameLength) throw new CliError(`Namnet får vara högst ${LIMITS.nameLength} tecken`)
        const a = isLocal(args[0] ?? '') ? undefined : api()
        const m = await load(args[0], a)
        const r = await save(m, m.doc, a, name)
        io.out(flags.json ? JSON.stringify(r) : `Heter nu "${name}".`)
        return 0
      }
      case 'delete': {
        if (isLocal(args[0] ?? '')) throw new CliError('Ta bort en lokal fil med rm.')
        if (!flags.yes) throw new CliError('Lägg till --yes för att ta bort (modellen hamnar i serverns papperskorg).')
        const a = api()
        const meta = await findRemote(a, args[0] ?? '')
        const r = await a.delete(meta.id, meta.revision)
        if (!r.ok) throw new CliError('Modellen ändrades nyss på en annan enhet. Den finns kvar; kör igen om du vill.')
        io.out(`"${meta.name}" ligger i serverns papperskorg.`)
        return 0
      }
      case 'edit': {
        const target = args[0]
        const source = flags.ops ?? (args[1] && args[1] !== '-' ? await readLimited(args[1]) : undefined)
        let text = source
        if (text === undefined) {
          if (io.stdinIsTty)
            throw new CliError("Ge operationerna som fil, med --ops '[…]' eller på stdin. Se bygg ops.")
          text = await io.readStdin()
        }
        if (text.length > MAX_INPUT_BYTES) throw new CliError('Operationerna är för stora')
        const ops = parseJson(text, 'Operationerna')
        const a = isLocal(target ?? '') ? undefined : api()
        const m = await load(target, a)
        await loadMaterials(m.doc, a)
        const r = applyOps(m.doc, ops)
        if (!r.ok) {
          const why = r.error.replace(/\.$/, '')
          throw new CliError(`${r.index === undefined ? why : `Operation ${r.index + 1}: ${why}`}. Inget sparades.`)
        }
        const saved = flags['dry-run'] ? { dryRun: true } : await save(m, r.doc, a)
        const summary = summarize(m.name, r.doc)
        if (flags.json) json({ ...saved, changed: r.changed, refs: r.refs, ...(flags.show && { model: summary }) })
        else {
          const where =
            'dryRun' in saved
              ? 'Inte sparat (--dry-run).'
              : 'file' in saved
                ? `Sparat i ${saved.file}.`
                : `Sparat, revision ${saved.revision}.`
          io.out(`${where} ${r.changed} ändringar. ${summary.counts.parts} delar, ${summary.counts.tools} verktyg.`)
          const refs = Object.entries(r.refs)
          if (refs.length) io.out(`Nya: ${refs.map(([k, v]) => `${k}=${v.slice(0, 8)}`).join(', ')}`)
          if (flags.show) io.out('\n' + summaryText(summary))
        }
        return 0
      }
      default:
        io.err(`Okänt kommando "${command}". Se bygg help.`)
        return 2
    }
  } catch (e) {
    if (e instanceof CliError) {
      io.err(e.message)
      return 1
    }
    throw e
  }

  async function create(a: Api, name: string, doc: ModelDocument): Promise<number> {
    const id = randomUUID()
    if (!MODEL_ID_PATTERN.test(id)) throw new CliError('Kunde inte skapa ett id')
    const r = await a.put(id, { name, baseRevision: null, file: serialize(doc) })
    if (!r.ok) throw new CliError('Id:t fanns redan; kör igen')
    io.out(flags.json ? JSON.stringify({ id, revision: r.res.revision }) : `Skapade "${name}": ${id}`)
    return 0
  }
}

function openBrowser(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true })
      .on('error', () => {})
      .unref()
  } catch {
    // Då får man öppna adressen själv.
  }
}
