import { describe, expect, it } from 'vitest'
import { applyKey, backspace, menuLayout, MENU_W, type MenuItem } from './menuLayout'

const overlaps = (a: MenuItem, b: MenuItem) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1e-9 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 1e-9

const measure = {
  hint: 'Dra i pilen, eller skriv måttet.',
  fields: [{ label: 'Tjocklek', value: '22', unit: 'mm' }],
  active: 0 as const,
  names: [] as string[],
  repeat: null as string | null,
  mode: null as string | null,
}

describe('menuLayout', () => {
  it('bara verktygen när inget pågår, med det valda markerat', () => {
    const items = menuLayout({ tool: 'rect', measure: null, note: null })
    expect(items.filter((i) => i.action?.kind === 'tool').map((i) => i.label)).toEqual([
      'Välj',
      'Rektangel',
      'Cirkel',
      'Flytta',
      'Mät',
    ])
    // Ikoner, som i verktygsraden i 3D-vyn.
    expect(items.filter((i) => i.action?.kind === 'tool').every((i) => i.icon)).toBe(true)
    expect(items.find((i) => i.id === 'tool-rect')?.tone).toBe('toolActive')
    expect(items.some((i) => i.id.startsWith('key-'))).toBe(false)
  })

  it('sifferblock, fält och hjälptext under en operation', () => {
    const items = menuLayout({ tool: 'select', measure, note: null })
    const labels = items.map((i) => i.label)
    for (const k of ['0', '1', '9', 'Radera', '−', ',', 'OK', 'Avbryt']) expect(labels).toContain(k)
    expect(labels).toContain('Tjocklek  22 mm')
    expect(labels).toContain(measure.hint)
  })

  it('knapparna ligger inom menyn och överlappar inte varandra', () => {
    const items = menuLayout({
      tool: 'rect',
      measure: { ...measure, fields: [measure.fields[0]!, { label: 'Bredd', value: '300', unit: 'mm' }] },
      note: 'Avstånd 120 mm',
    })
    const panel = items[0]!
    expect(panel.tone).toBe('panel')
    const rest = items.slice(1)
    for (const a of rest) {
      expect(Math.abs(a.x) + a.w / 2).toBeLessThanOrEqual(MENU_W / 2 + 1e-9)
      expect(a.y - a.h / 2).toBeGreaterThanOrEqual(0)
      expect(a.y + a.h / 2).toBeLessThanOrEqual(panel.h + 1e-9)
      for (const b of rest) if (a !== b) expect(overlaps(a, b)).toBe(false)
    }
    // Två fält: det man skriver i är markerat.
    expect(items.find((i) => i.id === 'field-0')?.tone).toBe('fieldActive')
    expect(items.find((i) => i.id === 'field-1')?.tone).toBe('field')
  })

  it('inget ångra eller gör om (de ligger på A och B), och luft mellan verktygen och sifferblocket', () => {
    const items = menuLayout({ tool: 'select', measure, note: null })
    expect(items.some((i) => i.id === 'undo' || i.id === 'redo')).toBe(false)
    const tools = items.filter((i) => i.action?.kind === 'tool')
    const keys = items.filter((i) => i.id.startsWith('key-'))
    const toolsTop = Math.max(...tools.map((i) => i.y + i.h / 2))
    const keysBottom = Math.min(...keys.map((i) => i.y - i.h / 2))
    expect(keysBottom - toolsTop).toBeGreaterThanOrEqual(0.012 - 1e-9)
  })

  it('id:n är unika', () => {
    const items = menuLayout({ tool: 'select', measure, note: 'x' })
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })
})

describe('sifferblocket, som i 3D-vyn', () => {
  it('samma ordning som NUMPAD_KEYS, med Avbryt där tangentbordet sitter', () => {
    const items = menuLayout({ tool: 'select', measure, note: null })
    const keys = items.filter((i) => i.id.startsWith('key-'))
    // Uppifrån: högst y först.
    const rows = [...new Set(keys.map((k) => k.y))].sort((a, b) => b - a)
    const labels = rows.map((y) =>
      keys
        .filter((k) => k.y === y)
        .sort((a, b) => a.x - b.x)
        .map((k) => k.label),
    )
    expect(labels).toEqual([
      ['Radera', '(', ')', '÷'],
      ['7', '8', '9', '×'],
      ['4', '5', '6', '−'],
      ['1', '2', '3', '+'],
      ['Avbryt', '0', ',', 'OK'],
    ])
  })
  it('parametrarnas namn på en rad ovanför, högst fyra', () => {
    const items = menuLayout({ tool: 'select', measure: { ...measure, names: ['a', 'b', 'c', 'd', 'e'] }, note: null })
    expect(items.filter((i) => i.tone === 'name').map((i) => i.label)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('Som förra och vad skissen blir', () => {
  it('ovanför fältet, med det valda läget markerat', () => {
    const items = menuLayout({
      tool: 'select',
      measure: { ...measure, repeat: 'Som förra 8 mm', mode: 'add' },
      note: null,
    })
    const field = items.find((i) => i.id === 'field-0')!
    const repeat = items.find((i) => i.id === 'repeat')!
    const modes = items.filter((i) => i.id.startsWith('mode-'))
    expect(modes.map((i) => i.label)).toEqual(['Ny del', 'Lägg till', 'Skär ut'])
    expect(modes.find((i) => i.tone === 'toolActive')?.label).toBe('Lägg till')
    expect(repeat.label).toBe('Som förra 8 mm')
    expect(repeat.y).toBeGreaterThan(field.y)
    expect(modes[0]!.y).toBeGreaterThan(field.y)
  })
  it('inget av dem när det inte finns', () => {
    const items = menuLayout({ tool: 'select', measure, note: null })
    expect(items.some((i) => i.id === 'repeat' || i.id.startsWith('mode-'))).toBe(false)
  })
})

describe('applyKey och backspace', () => {
  it('siffror, komma och parenteser läggs till', () => {
    expect(applyKey('4', '5')).toBe('45')
    expect(applyKey('4', ',')).toBe('4,')
    expect(applyKey('', '(')).toBe('(')
  })
  it('räknesätt med mellanrum, som i sifferblocket; minus först blir negativt', () => {
    expect(applyKey('450', ' - ')).toBe('450 - ')
    expect(applyKey('450', ' * ')).toBe('450 * ')
    expect(applyKey('', ' - ')).toBe('-')
    expect(applyKey('', ' + ')).toBe('')
    expect(applyKey('', ' / ')).toBe('')
  })
  it('radera tar ett räknesätt med mellanrummen, annars sista tecknet', () => {
    expect(backspace('450 - ')).toBe('450')
    expect(backspace('450')).toBe('45')
    expect(backspace('')).toBe('')
  })
})

describe('meddelanden', () => {
  const notice = { id: 'n1', text: '"Byrå" uppdaterades från en annan enhet.', action: null, count: 1 }

  it('överst, ovanför sifferblocket, med Stäng under texten', () => {
    const items = menuLayout({ tool: 'select', measure, note: null, notice })
    const text = items.find((i) => i.id === 'notice')!
    const close = items.find((i) => i.id === 'notice-close')!
    expect(text.label).toBe(notice.text)
    expect(close.action).toEqual({ kind: 'dismiss', id: 'n1' })
    expect(close.y).toBeLessThan(text.y)
    const others = items.filter((i) => i.tone !== 'panel' && !i.id.startsWith('notice'))
    expect(close.y - close.h / 2).toBeGreaterThan(Math.max(...others.map((i) => i.y + i.h / 2)))
    expect(items.some((i) => i.id === 'notice-action')).toBe(false)
  })

  it('meddelandets egen knapp bredvid Stäng, och hur många fler som finns', () => {
    const items = menuLayout({
      tool: 'rect',
      measure: null,
      note: 'Rita på golvet.',
      notice: { ...notice, action: 'Ångra', count: 3 },
    })
    expect(items.find((i) => i.id === 'notice-action')?.action).toEqual({ kind: 'noticeAction', id: 'n1' })
    expect(items.find((i) => i.id === 'notice')?.label).toBe(`${notice.text} (2 till)`)
    const panel = items[0]!
    const rest = items.slice(1)
    for (const a of rest) {
      expect(Math.abs(a.x) + a.w / 2).toBeLessThanOrEqual(MENU_W / 2 + 1e-9)
      expect(a.y + a.h / 2).toBeLessThanOrEqual(panel.h + 1e-9)
      for (const b of rest) if (a !== b) expect(overlaps(a, b)).toBe(false)
    }
  })
})

describe('verklig storlek', () => {
  it('en knapp tillbaka ovanför verktygen när man zoomat, annars ingen', () => {
    expect(menuLayout({ tool: 'select', measure: null, note: null }).some((i) => i.id === 'real-size')).toBe(false)
    const items = menuLayout({ tool: 'select', measure: null, note: null, scale: '1:5' })
    const button = items.find((i) => i.id === 'real-size')!
    expect(button.label).toBe('Verklig storlek (nu 1:5)')
    expect(button.action).toEqual({ kind: 'realSize' })
    const toolsTop = Math.max(...items.filter((i) => i.action?.kind === 'tool').map((i) => i.y + i.h / 2))
    expect(button.y).toBeGreaterThan(toolsTop)
  })
})
