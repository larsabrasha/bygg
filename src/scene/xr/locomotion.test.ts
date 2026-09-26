import { describe, expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import { grabRig, startPlacement, turnAround, walkStep, WALK_MM_PER_S } from './locomotion'

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

  it('origo stannar på golvet', () => {
    const { position } = grabRig({ pos: [0, 1500, 0], yaw: 0 }, { pos: [0.1, 0.9, 0.1], yaw: 0 }, 1000)
    expect(position[1]).toBe(0)
  })

  it('vrider man handen åt vänster vrids världen med: man själv vrids åt höger', () => {
    const { yaw } = grabRig({ pos: [0, 0, 0], yaw: 0 }, { pos: [0, 1, 0], yaw: 0.4 }, 1000)
    expect(yaw).toBeCloseTo(-0.4, 9)
  })
})
