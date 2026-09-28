import Module, { type ManifoldToplevel } from 'manifold-3d'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildCutList } from '../model/cutlist'
import { faceFrame, GROUND_FRAME, isMirrored, mirrorFrame, toWorld } from '../model/frame'
import { bodiesBox, bodyCenter } from '../model/geometry'
import { anglesOf, restOf } from '../model/orientation'
import { drawingPositions } from '../model/partSheet'
import { resolveBodies } from '../model/resolve'
import { buildSolid, type SolidMesh } from '../model/solid'
import { testBody } from '../model/testFixtures'
import { FACES, type Body, type Vec3 } from '../model/types'
import { cross, dot, sub } from '../model/vec'
import { partMeshes } from '../scene/fileExport'
import { resetDocumentStore, useDocumentStore } from './documentStore'

const s = () => useDocumentStore.getState()
const bodies = () => resolveBodies(s().doc)
const body = (id: string) => bodies().find((b) => b.id === id)!
const box = (id: string) => bodiesBox([body(id)])
const close = (a: readonly number[], b: readonly number[]) => a.forEach((x, k) => expect(x).toBeCloseTo(b[k]!, 6))

/** Lådan runt delens verktyg (spåret) i världen, som den ritas på just den kopian. */
function toolBox(b: Body): { min: Vec3; max: Vec3 } {
  const t = b.tools![0]!
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const x of [t.profile.x0, t.profile.x1])
    for (const y of [t.profile.y0, t.profile.y1])
      for (const z of [t.z0, t.z1]) {
        const p = toWorld(b.frame, toWorld(t.frame, [x, y, z]))
        p.forEach((c, k) => ((min[k] = Math.min(min[k]!, c)), (max[k] = Math.max(max[k]!, c))))
      }
  return { min, max }
}

/**
 * En stående sida, 18 × 300 × 600 (x, z, y), med ett stoppat spår på insidan (x = 18):
 * 8 mm djupt, 100 mm från framkanten och 500 mm upp från golvet.
 */
function sideWithGroove() {
  const side = s().pushPullSketch(s().addSketch(GROUND_FRAME, { x0: 0, y0: 0, x1: 18, y1: 300 })!, 600)!
  const groove = s().pushPullSketch(s().addSketch(GROUND_FRAME, { x0: 10, y0: 100, x1: 18, y1: 110 })!, 500)!
  expect(s().combine(groove, 'subtract', side)).toBeNull()
  s().select(null)
  return { side, groove }
}

describe('spegla', () => {
  beforeEach(() => resetDocumentStore())

  it('en länkad kopia blir spegelvänd: spåret hamnar på insidan, och den förblir länkad', () => {
    const { side } = sideWithGroove()
    const copy = s().duplicateLinked(side)!
    s().moveInstances([copy], [1000 - 18 - box(copy).min[0], 0, 0])
    expect(box(copy).min[0]).toBeCloseTo(982, 6)
    // Före: spåret sitter på utsidan av den högra sidan (x = 992–1000).
    close(toolBox(body(copy)).min, [992, 0, -110])

    s().mirrorInstances([copy], 'x')
    expect(isMirrored(body(copy).frame)).toBe(true)
    expect(body(copy).defId).toBe(body(side).defId)
    // Delen står kvar där den stod, men spåret sitter nu på insidan (x = 982–990).
    close(box(copy).min, [982, 0, -300])
    close(toolBox(body(copy)).min, [982, 0, -110])
    close(toolBox(body(copy)).max, [990, 500, -100])

    // Görs sidan tjockare inåt på originalet, blir kopian det också: speglat, inåt.
    expect(s().pushPullBody(side, 'u+', 10)).toBe(true)
    close([box(side).min[0], box(side).max[0]], [0, 28])
    close([box(copy).min[0], box(copy).max[0]], [972, 1000])

    // Två speglingar tar ut varandra.
    s().mirrorInstances([copy], 'x')
    expect(isMirrored(body(copy).frame)).toBe(false)
  })

  it('kaplistan har dem på samma rad, men ritningen som två olika delar', () => {
    const { side } = sideWithGroove()
    const copy = s().duplicateLinked(side)!
    expect(drawingPositions(bodies())).toHaveLength(1)
    s().mirrorInstances([copy], 'x')
    expect(buildCutList(bodies()).rows).toMatchObject([{ count: 2 }])
    expect(drawingPositions(bodies()).map((r) => r.count)).toEqual([1, 1])
  })

  it('verktyget följer med sin värd, och flera delar speglas runt sin gemensamma mitt', () => {
    const { side, groove } = sideWithGroove()
    const other = s().pushPullSketch(s().addSketch(GROUND_FRAME, { x0: 400, y0: 0, x1: 418, y1: 300 })!, 600)!
    s().mirrorInstances([side, other], 'x')
    // Mitten av båda är x = 209: sidan (0–18) hamnar på 400–418 och tvärtom.
    close([box(side).min[0], box(side).max[0]], [400, 418])
    close([box(other).min[0], box(other).max[0]], [0, 18])
    // Spåret sitter kvar på samma sida av delen i förhållande till den, som i en spegel: nu mot x = 400.
    close([box(groove).min[0], box(groove).max[0]], [400, 408])
    close(toolBox(body(side)).min, [400, 0, -110])
  })

  it('vinklarna räknas som förut, och vridning går som vanligt', () => {
    const { side } = sideWithGroove()
    s().mirrorInstances([side], 'z')
    const inst = () => s().doc.instances.find((i) => i.id === side)!
    expect(anglesOf(inst().frame, restOf(inst()))).toEqual([0, 0, 0])
    expect(s().setAngle(side, 'y', '90')).toBeNull()
    expect(anglesOf(inst().frame, restOf(inst()))).toEqual([0, 90, 0])
    expect(isMirrored(inst().frame)).toBe(true)
  })

  it('ett lägesuttryck längs speglingens axel slutar gälla, de andra står kvar', () => {
    const { side } = sideWithGroove()
    const other = s().pushPullSketch(s().addSketch(GROUND_FRAME, { x0: 400, y0: 0, x1: 418, y1: 300 })!, 600)!
    const param = s().addParam()!
    s().updateParam(param, { name: 'noll', expr: '0' })
    expect(s().setPosition(side, 'x', 'noll')).toBeNull()
    expect(s().setPosition(side, 'y', 'noll')).toBeNull()
    expect(s().doc.instances.find((i) => i.id === side)!.pos).toEqual({ x: 'noll', y: 'noll' })
    s().mirrorInstances([side, other], 'x')
    expect(s().doc.instances.find((i) => i.id === side)!.pos).toEqual({ y: 'noll' })
  })
})

describe('spegelvänd frame', () => {
  const mirrored = testBody({ frame: mirrorFrame({ ...GROUND_FRAME, origin: [100, 0, 0] }, 'x', 0) })

  it('ytornas frame är högerhänt och pekar ut från delen', () => {
    for (const face of FACES) {
      const f = faceFrame(mirrored, face)
      close(cross(f.u, f.v), f.n)
      expect(dot(f.n, sub(f.origin, bodyCenter(mirrored)))).toBeGreaterThan(0)
    }
  })

  it('exporten har trianglarna åt rätt håll', () => {
    for (const b of [testBody(), mirrored]) {
      const g = partMeshes([b], {}, 'z')[0]!.geometry
      const p = g.getAttribute('position')
      const pt = (i: number): Vec3 => [p.getX(i), p.getY(i), p.getZ(i)]
      const all = Array.from({ length: p.count }, (_, i) => pt(i))
      const mid = [0, 1, 2].map((k) => all.reduce((a, q) => a + q[k]!, 0) / all.length) as Vec3
      for (let i = 0; i < p.count; i += 3) {
        const [a, b2, c] = [pt(i), pt(i + 1), pt(i + 2)]
        const n = cross(sub(b2, a), sub(c, a))
        const centroid = [0, 1, 2].map((k) => (a[k]! + b2[k]! + c[k]!) / 3) as Vec3
        expect(dot(n, sub(centroid, mid))).toBeGreaterThan(0)
      }
    }
  })
})

describe('manifold med ett spegelvänt verktyg', () => {
  let api: ManifoldToplevel
  beforeAll(async () => {
    api = await Module()
    api.setup()
  })

  /** Volymen innanför en sluten yta (divergenssatsen). */
  function volume({ positions: p, indices: ix }: SolidMesh): number {
    let v = 0
    for (let t = 0; t < ix.length; t += 3) {
      const [a, b, c] = [ix[t]! * 3, ix[t + 1]! * 3, ix[t + 2]! * 3]
      v +=
        (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
          p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
          p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
        6
    }
    return v
  }

  it('skär ut rätt volym', () => {
    const leg = { profile: { x0: 0, y0: 0, x1: 40, y1: 40 }, z0: 0, z1: 800 }
    const mesh = buildSolid(api, leg, [
      {
        op: 'subtract',
        profile: { x0: 0, y0: 0, x1: 10, y1: 30 },
        z0: 0,
        z1: 25,
        // Spegelvänd: u pekar åt −x, så hålet ligger på x = 15–25.
        frame: { origin: [25, 5, 700], u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
      },
    ])
    expect(volume(mesh)).toBeCloseTo(40 * 40 * 800 - 10 * 30 * 25, 0)
  })
})
