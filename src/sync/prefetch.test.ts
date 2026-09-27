import { describe, expect, it } from 'vitest'
import { prefetched } from './prefetch'

/** En hämtning som blir klar när testet säger till. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('prefetched', () => {
  it('ger resultaten i ordning, fast de blir klara i en annan', async () => {
    const d = [deferred<string>(), deferred<string>(), deferred<string>()]
    const gen = prefetched([0, 1, 2], 3, (i) => d[i]!.promise)
    const first = gen.next()
    d[2]!.resolve('c')
    d[1]!.resolve('b')
    d[0]!.resolve('a')
    const got = [(await first).value]
    for await (const r of gen) got.push(r)
    expect(got).toEqual([
      [0, 'a'],
      [1, 'b'],
      [2, 'c'],
    ])
  })

  it('har högst ahead på väg samtidigt', async () => {
    let running = 0
    let most = 0
    const f = async (i: number) => {
      running++
      most = Math.max(most, running)
      await new Promise((r) => setTimeout(r, 1))
      running--
      return i
    }
    const got: number[] = []
    for await (const [, r] of prefetched([...Array(10).keys()], 3, f)) got.push(r)
    expect(got).toEqual([...Array(10).keys()])
    expect(most).toBe(3)
  })

  it('felet kommer när det står på tur; de före är redan behandlade', async () => {
    const f = async (i: number) => {
      if (i === 2) throw new Error('nät')
      return i
    }
    const got: number[] = []
    await expect(
      (async () => {
        for await (const [, r] of prefetched([0, 1, 2, 3], 4, f)) got.push(r)
      })(),
    ).rejects.toThrow('nät')
    expect(got).toEqual([0, 1])
  })
})
