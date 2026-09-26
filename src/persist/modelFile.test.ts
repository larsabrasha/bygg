import { describe, expect, it } from 'vitest'
import { emptyDoc, testSketch } from '../model/testFixtures'
import { FORMAT_VERSION } from './format'
import { modelFileJson, nameFromFileName, readModelFile } from './modelFile'

describe('modelfilen', () => {
  const doc = { ...emptyDoc(), sketches: [testSketch()] }

  it('läses tillbaka med namn och dokument', () => {
    const r = readModelFile(modelFileJson('Bokhylla', doc), 'fil')
    expect(r).toEqual({ ok: true, name: 'Bokhylla', doc })
  })

  it('har appens namn och formatets version', () => {
    const raw = JSON.parse(modelFileJson('Bokhylla', doc, new Date('2026-09-26T10:00:00Z')))
    expect(raw).toMatchObject({
      app: 'bygg',
      name: 'Bokhylla',
      version: FORMAT_VERSION,
      savedAt: '2026-09-26T10:00:00.000Z',
    })
  })

  it('läser serverns fil', () => {
    const server = {
      id: 'x',
      name: 'Pall',
      revision: 3,
      updatedAt: '',
      file: { version: FORMAT_VERSION, savedAt: '', doc },
    }
    expect(readModelFile(JSON.stringify(server), 'fil')).toEqual({ ok: true, name: 'Pall', doc })
  })

  it('tar filens namn när namnet saknas', () => {
    const saved = { version: FORMAT_VERSION, savedAt: '', doc }
    expect(readModelFile(JSON.stringify(saved), 'Fil')).toMatchObject({ ok: true, name: 'Fil' })
  })

  it('säger nej till annat än en modell', () => {
    expect(readModelFile('inte json', 'f')).toEqual({ ok: false, reason: 'Filen är inte en modellfil' })
    expect(readModelFile('{"asset":{"version":"2.0"}}', 'f')).toEqual({
      ok: false,
      reason: 'Filen är inte en modellfil',
    })
    expect(readModelFile(JSON.stringify({ version: FORMAT_VERSION + 1, doc }), 'f')).toMatchObject({ ok: false })
    expect(readModelFile(JSON.stringify({ version: FORMAT_VERSION, doc: { defs: 3 } }), 'f')).toEqual({
      ok: false,
      reason: 'Trasigt dokument',
    })
  })

  it('namnet ur filnamnet', () => {
    expect(nameFromFileName('Bokhylla.bygg.json')).toBe('Bokhylla')
    expect(nameFromFileName('Bokhylla (1).json')).toBe('Bokhylla (1)')
    expect(nameFromFileName('.json')).toBe('Importerad modell')
  })
})
