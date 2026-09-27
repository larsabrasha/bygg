import { describe, expect, it } from 'vitest'
import { licenseName, licensesPage, packageDirOf, repoUrl } from './attributions'

describe('packageDirOf', () => {
  it('paketets katalog, med och utan scope, och med fråga efter modulen', () => {
    expect(packageDirOf('/app/node_modules/three/build/three.module.js')).toBe('/app/node_modules/three')
    expect(packageDirOf('/app/node_modules/@react-three/fiber/dist/x.js')).toBe('/app/node_modules/@react-three/fiber')
    expect(packageDirOf('\0/app/node_modules/manifold-3d/manifold.wasm?url')).toBe('/app/node_modules/manifold-3d')
  })

  it('det innersta paketet när ett paket har egna node_modules', () => {
    expect(packageDirOf('/app/node_modules/a/node_modules/b/index.js')).toBe('/app/node_modules/a/node_modules/b')
  })

  it('null för appens egen kod och Vites egna moduler', () => {
    expect(packageDirOf('/app/src/main.tsx')).toBeNull()
    expect(packageDirOf('\0vite/preload-helper.js')).toBeNull()
  })

  it('Windows-sökvägar', () => {
    expect(packageDirOf('C:\\app\\node_modules\\zustand\\index.js')).toBe('C:/app/node_modules/zustand')
  })
})

describe('repoUrl', () => {
  it('gör om git-adresser till webbadresser', () => {
    expect(repoUrl({ type: 'git', url: 'git+https://github.com/mrdoob/three.js.git' })).toBe(
      'https://github.com/mrdoob/three.js',
    )
    expect(repoUrl('git://github.com/a/b.git')).toBe('https://github.com/a/b')
    expect(repoUrl('git@github.com:a/b.git')).toBe('https://github.com/a/b')
    expect(repoUrl('pmndrs/zustand')).toBe('https://github.com/pmndrs/zustand')
    expect(repoUrl(undefined)).toBeUndefined()
  })
})

describe('licenseName', () => {
  it('licensen som text, också i gamla format', () => {
    expect(licenseName({ license: 'MIT' })).toBe('MIT')
    expect(licenseName({ license: { type: 'BSD-3-Clause' } })).toBe('BSD-3-Clause')
    expect(licenseName({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] })).toBe('MIT OR Apache-2.0')
    expect(licenseName({ license: 'SEE LICENSE IN LICENSE' })).toBe('Egen licens, se texten')
    expect(licenseName({})).toBe('okänd')
  })
})

describe('licensesPage', () => {
  it('skyddar namn, licenstexter och länkar, så att de inte blir HTML', () => {
    const html = licensesPage(
      [{ name: '<x>', version: '1.0', license: 'MIT', text: 'a < b & c', url: 'https://e.com/"q' }],
      'Version abc',
    )
    expect(html).toContain('&lt;x&gt;')
    expect(html).not.toContain('<x>')
    expect(html).toContain('a &lt; b &amp; c')
    expect(html).toContain('href="https://e.com/&quot;q"')
    expect(html).toContain('1 paket')
  })
})
