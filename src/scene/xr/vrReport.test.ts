import { describe, expect, it } from 'vitest'
import { formatVrReport, frameStats, newVrReport, recordFrame, recordSource } from './vrReport'

const pad = (pressed: number[], axes: number[] = [0, 0, 0, 0], mapping = 'xr-standard') => ({
  mapping,
  buttons: Array.from({ length: 6 }, (_, i) => ({ pressed: pressed.includes(i) })),
  axes,
})

describe('formatVrReport', () => {
  it('visar profil, knappar och spakar per hand, och bildtakten', () => {
    const r = newVrReport()
    recordSource(r, 'right', ['sony-playstation-vr2-sense', 'generic-trigger'], pad([0]))
    recordSource(r, 'right', ['sony-playstation-vr2-sense'], pad([4, 0]))
    recordSource(r, 'left', ['sony-playstation-vr2-sense'], pad([], [0, 0, 0.1, -0.9]))
    for (let i = 0; i < 90; i++) recordFrame(r, 1 / 90)
    expect(formatVrReport(r)).toBe(
      'VR: 90 bilder/s, 0 ryck. Vänster: sony-playstation-vr2-sense, knappar inga, spakar 3. ' +
        'Höger: sony-playstation-vr2-sense, knappar 0, 4, spakar inga.',
    )
  })

  it('säger till när layouten inte är standard', () => {
    const r = newVrReport()
    recordSource(r, 'left', [], pad([1], [0, 0, 0, 0], ''))
    recordFrame(r, 0.1)
    expect(formatVrReport(r)).toBe(
      'VR: 10 bilder/s, 0 ryck. Vänster: ingen profil (layout: okänd), knappar 1, spakar inga.',
    )
  })

  it('inget att säga utan kontroller och bilder', () => {
    expect(formatVrReport(newVrReport())).toBeNull()
  })
})

describe('frameStats', () => {
  it('räknar inte pauser: första bildrutan och när SteamVR-menyn är öppen', () => {
    const frames = [4.2, ...Array<number>(900).fill(1 / 90), 3.5, ...Array<number>(900).fill(1 / 90)]
    expect(frameStats(frames)).toEqual({ fps: 90, hitches: 0 })
  })
  it('räknar ryck: bildrutor som tar mer än en och en halv gång den vanliga tiden', () => {
    const frames = [...Array<number>(100).fill(1 / 90), 1 / 45, 1 / 45, 1 / 30]
    expect(frameStats(frames)?.hitches).toBe(3)
  })
  it('inget att säga utan bildrutor', () => {
    expect(frameStats([5])).toBeNull()
  })
})
