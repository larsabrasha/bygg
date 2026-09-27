import type { Box } from './box'
import { toLocal, toWorld } from './frame'
import type { Combine, Frame, Instance, ModelDocument, PartDef, Rect, Sketch, ToolShape, Vec3 } from './types'
import { dot, sub } from './vec'

/**
 * Lägg till och skär ut, icke-destruktivt: verktyget är en vanlig kopia med
 * combine = { op, host }. Här räknas det om till värdformens koordinater,
 * och hålls på plats när värden flyttas. Själva geometrin räknas i scene/csg.
 */

/** f uttryckt i hosts egna koordinater. */
export function relativeFrame(host: Frame, f: Frame): Frame {
  const dir = (d: Vec3): Vec3 => [dot(d, host.u), dot(d, host.v), dot(d, host.n)]
  return { origin: toLocal(host, f.origin), u: dir(f.u), v: dir(f.v), n: dir(f.n) }
}

/** Motsatsen till relativeFrame: rel (i hosts koordinater) i världen. */
export function composeFrame(host: Frame, rel: Frame): Frame {
  const dir = (d: Vec3): Vec3 => sub(toWorld(host, d), host.origin)
  return { origin: toWorld(host, rel.origin), u: dir(rel.u), v: dir(rel.v), n: dir(rel.n) }
}

/** Hörnen på en låda i sina egna koordinater. */
function corners({ profile: p, z0, z1 }: Box): Vec3[] {
  return [p.x0, p.x1].flatMap((x) => [p.y0, p.y1].flatMap((y) => [z0, z1].map((z): Vec3 => [x, y, z])))
}

/**
 * Ämnet att kapa till: formens låda, utökad så att allt som läggs till får
 * plats (en tapp gör regeln längre). Det som skärs ut ändrar inte ämnet;
 * man kapar först och tar upp hålet sedan. Null om inget läggs till.
 */
export function blankBox(box: Box, tools: readonly ToolShape[]): Box | null {
  const adds = tools.filter((t) => t.op === 'add')
  if (adds.length === 0) return null
  let { x0, y0, x1, y1 } = box.profile
  let { z0, z1 } = box
  for (const t of adds)
    for (const c of corners(t)) {
      const [x, y, z] = toWorld(t.frame, c)
      ;[x0, x1, y0, y1, z0, z1] = [
        Math.min(x0, x),
        Math.max(x1, x),
        Math.min(y0, y),
        Math.max(y1, y),
        Math.min(z0, z),
        Math.max(z1, z),
      ]
    }
  const profile: Rect = { x0, y0, x1, y1 }
  return { profile, z0, z1 }
}

/**
 * Vad en skiss på en del blir när den dras ut: ny del, tillägg på delen eller
 * urtag i den. 'auto' = efter riktningen: in i delen ett urtag, ut en ny del.
 */
export type SketchMode = 'auto' | 'new' | Combine['op']

/**
 * Tillägget eller urtaget en skiss blir när den dras ut distance, på delen den
 * ritades på. Null = en ny, egen del (skissen ligger inte på en del, eller mode
 * eller riktningen säger det).
 */
export function sketchCombine(
  doc: ModelDocument,
  sketch: Pick<Sketch, 'on'>,
  distance: number,
  mode: SketchMode = 'auto',
): Combine | null {
  const op = mode === 'auto' ? (distance < 0 ? 'subtract' : null) : mode === 'new' ? null : mode
  if (!op || !sketch.on) return null
  const host = doc.instances.find((i) => i.id === sketch.on)
  // Ett verktyg har bara sin egen form (se combineError); där blir det en vanlig del.
  return host && !host.combine ? { op, host: host.id } : null
}

/** Kopian är värd för något verktyg, eller har ett tapphål. */
export function isHost(doc: ModelDocument, instanceId: string): boolean {
  return doc.instances.some((i) => i.combine?.host === instanceId || i.combine?.into === instanceId)
}

/** Delarna ett verktyg påverkar: värden, och för en tapp även delen den går in i. */
export function toolTargets(c: Combine): string[] {
  return c.into ? [c.host, c.into] : [c.host]
}

/** Varför host inte kan få en tapp in i into, eller null om det går. */
export function jointError(doc: ModelDocument, hostId: string, intoId: string): string | null {
  const host = doc.instances.find((i) => i.id === hostId)
  const into = doc.instances.find((i) => i.id === intoId)
  if (!host || !into) return 'Delen finns inte'
  if (hostId === intoId) return 'Tryck på en annan del'
  if (host.defId === into.defId) return 'Länkade kopior av samma del kan inte tappas i varandra'
  if (host.combine || into.combine) return 'Ett verktyg kan inte få en tapp'
  if (doc.instances.some((i) => i.combine?.op === 'joint' && i.combine.host === hostId && i.combine.into === intoId)) {
    const name = (id: string) => doc.defs.find((d) => d.id === id)?.name ?? 'delen'
    return `${name(host.defId)} har redan en tapp i ${name(into.defId)}`
  }
  return null
}

/** Varför tool inte kan läggas till på eller skäras ut ur host, eller null om det går. */
export function combineError(doc: ModelDocument, toolId: string, hostId: string): string | null {
  const tool = doc.instances.find((i) => i.id === toolId)
  const host = doc.instances.find((i) => i.id === hostId)
  if (!tool || !host) return 'Delen finns inte'
  if (toolId === hostId) return 'En del kan inte skära i sig själv'
  if (tool.defId === host.defId) return 'Länkade kopior av samma del kan inte skära i varandra'
  // Ett verktyg har bara sin egen enkla form, så kedjor av verktyg tillåts inte.
  if (host.combine) return 'Delen är redan ett verktyg på en annan del'
  if (isHost(doc, toolId)) return 'Delen har egna urtag eller tillägg'
  return null
}

/**
 * Verktygen följer med sin värd: har en värd fått ny frame (flyttats,
 * vridits, fått nytt läge av en parameter) flyttas dess verktyg lika mycket.
 * before är dokumentet före ändringen.
 */
export function carryTools(before: ModelDocument, after: ModelDocument): ModelDocument {
  const old = new Map(before.instances.map((i) => [i.id, i]))
  const now = new Map(after.instances.map((i) => [i.id, i]))
  let changed = false
  const instances = after.instances.map((t): Instance => {
    if (!t.combine) return t
    const hostBefore = old.get(t.combine.host)
    const hostNow = now.get(t.combine.host)
    const toolBefore = old.get(t.id)
    if (!hostBefore || !hostNow || !toolBefore || hostBefore.frame === hostNow.frame) return t
    changed = true
    return { ...t, frame: composeFrame(hostNow.frame, relativeFrame(hostBefore.frame, toolBefore.frame)) }
  })
  return changed ? { ...after, instances } : after
}

/**
 * Verktyg vars värd inte finns längre blir vanliga delar igen. En tapp vars
 * del med tapphålet tagits bort blir ett vanligt tillägg på sin värd.
 */
export function detachOrphans(doc: ModelDocument): ModelDocument {
  const ids = new Set(doc.instances.map((i) => i.id))
  const ok = (c: Combine) => ids.has(c.host) && (!c.into || ids.has(c.into))
  if (doc.instances.every((i) => !i.combine || ok(i.combine))) return doc
  return {
    ...doc,
    instances: doc.instances.map((i): Instance => {
      if (!i.combine || ok(i.combine)) return i
      const { combine, ...rest } = i
      return ids.has(combine.host) ? { ...rest, combine: { op: 'add', host: combine.host } } : rest
    }),
  }
}

/** Talen avrundade till en tusendels mm, så att två likadana känns igen (som i resolve). */
const rounded = (x: unknown) =>
  JSON.stringify(x, (_, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v))

/** Tapparna i samma grupp (Combine.group) som tappen id, utom den själv. */
export function jointTwins(doc: ModelDocument, id: string): Instance[] {
  const group = doc.instances.find((i) => i.id === id)?.combine?.group
  if (!group) return []
  return doc.instances.filter((i) => i.id !== id && i.combine?.op === 'joint' && i.combine.group === group)
}

/**
 * Format 7 → 8: tappar sparades utan grupp, och gjordes en och en för varje ben. De som
 * uppenbart hör ihop får en grupp: tappar från länkade kopior av samma del in i samma del,
 * med samma form och på samma ställe på sin kopia. Görs bara när en äldre fil läses.
 */
export function groupLegacyJoints(doc: ModelDocument, newGroup: () => string): ModelDocument {
  const key = (t: Instance) => {
    if (t.combine?.op !== 'joint' || !t.combine.into || t.combine.group) return null
    const host = doc.instances.find((i) => i.id === t.combine!.host)
    const d = doc.defs.find((x) => x.id === t.defId)
    if (!host || !d) return null
    const { profile, shape, z0, z1 } = d
    return rounded([host.defId, t.combine.into, profile, shape ?? null, z0, z1, relativeFrame(host.frame, t.frame)])
  }
  const groups = new Map<string, Instance[]>()
  for (const t of doc.instances) {
    const k = key(t)
    // En tapp per kopia: två likadana på samma kopia är inte tvillingar.
    if (k && !groups.get(k)?.some((x) => x.combine!.host === t.combine!.host))
      groups.set(k, [...(groups.get(k) ?? []), t])
  }
  const ids = new Map<string, string>()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const g = newGroup()
    for (const t of list) ids.set(t.id, g)
  }
  if (ids.size === 0) return doc
  return {
    ...doc,
    instances: doc.instances.map((i) =>
      ids.has(i.id) ? { ...i, combine: { ...i.combine!, group: ids.get(i.id)! } } : i,
    ),
  }
}

/**
 * Har en tapp ändrats (mått, läge, vinkel, namn) görs samma ändring på de andra i dess grupp
 * (jointTwins i before): samma form, och samma läge på sin kopia. Annars skulle en av
 * fyra tappar i en skiva ändras, och benen, som är länkade, få två tappar på varandra.
 * Ändras flera tvillingar samtidigt (en parameter) räknas var och en för sig.
 */
export function syncJointTwins(before: ModelDocument, after: ModelDocument): ModelDocument {
  const byId = (doc: ModelDocument) => new Map(doc.instances.map((i) => [i.id, i]))
  const oldInst = byId(before)
  const newInst = byId(after)
  const oldDefs = new Map(before.defs.map((d) => [d.id, d]))
  const newDefs = new Map(after.defs.map((d) => [d.id, d]))
  // Det i en tapp som ska vara lika för tvillingarna: formen, namnet, uttrycken och läget på värden.
  const state = (inst: Map<string, Instance>, defs: Map<string, PartDef>, id: string) => {
    const t = inst.get(id)
    const host = t?.combine && inst.get(t.combine.host)
    const d = t && defs.get(t.defId)
    if (!t || !host || !d) return null
    const { name, profile, shape, z0, z1, dims, grainAxis, thicknessAxis } = d
    return rounded([name, profile, shape, z0, z1, dims, grainAxis, thicknessAxis, relativeFrame(host.frame, t.frame)])
  }
  const changed = (id: string) => state(oldInst, oldDefs, id) !== state(newInst, newDefs, id)

  const instances = new Map(newInst)
  const defs = new Map(newDefs)
  let touched = false
  const done = new Set<string>()
  for (const t of after.instances) {
    if (t.combine?.op !== 'joint' || done.has(t.id) || !oldInst.has(t.id) || !changed(t.id)) continue
    const host = newInst.get(t.combine.host)
    const d = newDefs.get(t.defId)
    if (!host || !d) continue
    const rel = relativeFrame(host.frame, t.frame)
    const restRel = t.rest && relativeFrame(host.frame, { origin: host.frame.origin, ...t.rest })
    for (const twin of jointTwins(before, t.id)) {
      done.add(twin.id)
      const now = instances.get(twin.id)
      const twinHost = now?.combine && instances.get(now.combine.host)
      if (!now || !twinHost || changed(twin.id)) continue
      const { pos: _pos, rest: _rest, ...plain } = now
      void _pos
      void _rest
      let rest: Instance['rest']
      if (restRel) {
        const { u, v, n } = composeFrame(twinHost.frame, restRel)
        rest = { u, v, n }
      }
      // Läget på värden, inte i världen: ett uttryck för läget (pos) gäller bara tappen man ändrade.
      instances.set(twin.id, { ...plain, frame: composeFrame(twinHost.frame, rel), ...(rest && { rest }) })
      const own = defs.get(now.defId)
      if (own && own.id !== d.id) {
        const { name, profile, shape, z0, z1, dims, grainAxis, thicknessAxis } = d
        const { shape: _s, dims: _d, ...base } = own
        void _s
        void _d
        defs.set(own.id, {
          ...base,
          name,
          profile,
          z0,
          z1,
          grainAxis,
          thicknessAxis,
          ...(shape && { shape }),
          ...(dims && { dims }),
        })
      }
      touched = true
    }
    done.add(t.id)
  }
  if (!touched) return after
  return {
    ...after,
    defs: after.defs.map((x) => defs.get(x.id)!),
    instances: after.instances.map((i) => instances.get(i.id)!),
  }
}
