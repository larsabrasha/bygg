import { describe, expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import {
  grabRig,
  MAX_SCALE,
  MM_PER_M,
  scaleLabel,
  startPlacement,
  turnAround,
  twoHandRig,
  walkStep,
  WALK_MM_PER_S,
  type RigPose,
} from './locomotion'

const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6))

describe('startPlacement', () => {
  it('står framför modellen, minst 1,5 m bort', () => {
    expect(startPlacement([100, 400, -200], 300)).toEqual({ position: [100, 0, 1300], yaw: 0 })
  })
  it('står längre bort från en stor modell', () => {
    expect(startPlacement([0, 0, 0], 2000).position).toEqual([0, 0, 2900])
  })
})

describe('walkStep', () => {
  it('spaken framåt går mot -z när man tittar rakt fram', () => {
    close(walkStep(0, -1, 0, 1), [0, 0, -WALK_MM_PER_S])
  })
  it('spaken åt höger går åt +x', () => {
    close(walkStep(1, 0, 0, 1), [WALK_MM_PER_S, 0, 0])
  })
  it('följer huvudets riktning: vänd åt vänster går framåt mot -x', () => {
    close(walkStep(0, -1, Math.PI / 2, 1), [-WALK_MM_PER_S, 0, 0])
  })
  it('stämmer med three.js: framåt är kamerans -z efter vridningen', () => {
    const yaw = 0.7
    const o = new Object3D()
    o.rotation.set(0, yaw, 0)
    const forward = new Vector3(0, 0, -1).applyQuaternion(o.quaternion).multiplyScalar(WALK_MM_PER_S)
    close(walkStep(0, -1, yaw, 1), forward.toArray())
  })
  it('gör inget inom dödzonen', () => {
    close(walkStep(0.1, -0.1, 0, 1), [0, 0, 0])
  })
})

describe('turnAround', () => {
  it('huvudet står kvar på samma plats efter vridningen', () => {
    // Origo med vridning yaw; huvudet står 300 mm till höger om origo i dess egna koordinater.
    const angle = Math.PI / 6
    const rig = new Object3D()
    rig.position.set(1000, 0, 2000)
    rig.rotation.y = 0.4
    const head = new Object3D()
    head.position.set(300, 1600, -100)
    rig.add(head)
    rig.updateMatrixWorld(true)
    const before = head.getWorldPosition(new Vector3())

    rig.position.fromArray(turnAround(rig.position.toArray(), before.toArray(), angle))
    rig.rotation.y += angle
    rig.updateMatrixWorld(true)
    close(head.getWorldPosition(new Vector3()).toArray(), before.toArray())
  })
})

describe('grabRig', () => {
  /** Handen i världen med origo i position och vridning yaw, som three.js räknar. */
  const handInWorld = (position: number[], yaw: number, hand: number[]) => {
    const rig = new Object3D()
    rig.position.fromArray(position)
    rig.rotation.y = yaw
    rig.scale.setScalar(1000)
    rig.updateMatrixWorld(true)
    return new Vector3().fromArray(hand).applyMatrix4(rig.matrixWorld)
  }

  it('punkten man tog tag i står still när handen flyttas och vrids', () => {
    const start = { pos: [400, 1100, 900] as [number, number, number], yaw: 0.3 }
    const hand = { pos: [0.2, 1.05, -0.4] as [number, number, number], yaw: -0.5 }
    const { position, yaw } = grabRig(start, hand, 1000)
    const world = handInWorld(position, yaw, hand.pos)
    expect(world.x).toBeCloseTo(start.pos[0], 6)
    expect(world.z).toBeCloseTo(start.pos[2], 6)
    // Handens riktning i världen är densamma som när greppet började.
    expect(yaw + hand.yaw).toBeCloseTo(start.yaw, 9)
  })

  it('origo står kvar i höjd: på golvet, eller där en zoom med båda händerna lämnade den', () => {
    expect(grabRig({ pos: [0, 1500, 0], yaw: 0 }, { pos: [0.1, 0.9, 0.1], yaw: 0 }, 1000).position[1]).toBe(0)
    expect(grabRig({ pos: [0, 1500, 0], yaw: 0 }, { pos: [0.1, 0.9, 0.1], yaw: 0 }, 1000, 420).position[1]).toBe(420)
  })

  it('vrider man handen åt vänster vrids världen med: man själv vrids åt höger', () => {
    const { yaw } = grabRig({ pos: [0, 0, 0], yaw: 0 }, { pos: [0, 1, 0], yaw: 0.4 }, 1000)
    expect(yaw).toBeCloseTo(-0.4, 9)
  })
})

describe('twoHandRig', () => {
  /** En punkt i sessionen (meter) i världen, med origo i pose (som three.js räknar). */
  const inWorld = (pose: RigPose, p: number[]) => {
    const rig = new Object3D()
    rig.position.fromArray(pose.position)
    rig.rotation.y = pose.yaw
    rig.scale.setScalar(pose.scale)
    rig.updateMatrixWorld(true)
    return new Vector3().fromArray(p).applyMatrix4(rig.matrixWorld)
  }
  const start: RigPose = { position: [300, 0, 1200], yaw: 0.4, scale: MM_PER_M }
  const from: [Vec3, Vec3] = [
    [-0.2, 1.2, -0.3],
    [0.2, 1.2, -0.3],
  ]
  type Vec3 = [number, number, number]

  it('punkten mitt mellan händerna står still när man drar isär och vrider', () => {
    const now: [Vec3, Vec3] = [
      [-0.3, 1.3, -0.2],
      [0.35, 1.1, -0.5],
    ]
    const next = twoHandRig(start, from, now)
    const before = inWorld(start, [0, 1.2, -0.3])
    const after = inWorld(next, [0.025, 1.2, -0.35])
    expect(after.distanceTo(before)).toBeCloseTo(0, 6)
  })

  it('isär blir modellen större (mindre skala), ihop blir den mindre', () => {
    const apart = twoHandRig(start, from, [
      [-0.4, 1.2, -0.3],
      [0.4, 1.2, -0.3],
    ])
    expect(apart.scale).toBeCloseTo(MM_PER_M / 2, 6)
    const together = twoHandRig(start, from, [
      [-0.04, 1.2, -0.3],
      [0.04, 1.2, -0.3],
    ])
    expect(together.scale).toBeCloseTo(MM_PER_M * 5, 6)
  })

  it('riktningen mellan händerna står still i världen när man vrider dem', () => {
    const now: [Vec3, Vec3] = [
      [-0.2 * Math.cos(0.5), 1.2, -0.3 + 0.2 * Math.sin(0.5)],
      [0.2 * Math.cos(0.5), 1.2, -0.3 - 0.2 * Math.sin(0.5)],
    ]
    const next = twoHandRig(start, from, now)
    const dirBefore = inWorld(start, from[1]).sub(inWorld(start, from[0])).normalize()
    const dirAfter = inWorld(next, now[1]).sub(inWorld(next, now[0])).normalize()
    expect(dirAfter.distanceTo(dirBefore)).toBeCloseTo(0, 6)
  })

  it('snäpper till verklig storlek nära 1:1, och stannar vid gränserna', () => {
    const near = twoHandRig({ ...start, scale: MM_PER_M * 2 }, from, [
      [-0.39, 1.2, -0.3],
      [0.39, 1.2, -0.3],
    ])
    expect(near.scale).toBe(MM_PER_M)
    const tiny = twoHandRig(start, from, [
      [-0.001, 1.2, -0.3],
      [0.001, 1.2, -0.3],
    ])
    expect(tiny.scale).toBe(MAX_SCALE)
  })
})

describe('scaleLabel', () => {
  it('ingen text i verklig storlek; annars som på en ritning', () => {
    expect(scaleLabel(MM_PER_M)).toBeNull()
    expect(scaleLabel(MM_PER_M * 5)).toBe('1:5')
    expect(scaleLabel(MM_PER_M * 1.5)).toBe('1:1,5')
    expect(scaleLabel(MM_PER_M * 12.4)).toBe('1:12')
    expect(scaleLabel(MM_PER_M / 2)).toBe('2:1')
  })
})
