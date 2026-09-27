import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installScript } from './install'

const run = promisify(execFile)
const fakeCli = '#!/usr/bin/env node\nconsole.log("bygg " + process.argv.slice(2).join(" "))\n'

describe('install.sh', () => {
  let server: Server
  let origin: string
  let dir: string

  beforeEach(async () => {
    server = createServer((req, res) => {
      if (req.url === '/install.sh') res.end(installScript(origin))
      else if (req.url === '/cli/bygg.mjs') res.end(fakeCli)
      else res.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    dir = await mkdtemp(path.join(tmpdir(), 'bygg-install-'))
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  })

  const install = (env: Record<string, string> = {}) =>
    run('sh', ['-c', `curl -fsSL ${origin}/install.sh | sh`], {
      env: { ...process.env, HOME: dir, BYGG_BIN_DIR: path.join(dir, 'bin'), ...env },
    })

  it('hämtar CLI:t från samma server och gör det körbart', async () => {
    const { stdout } = await install()
    const bin = path.join(dir, 'bin', 'bygg')
    expect(await readFile(bin, 'utf8')).toBe(fakeCli)
    expect((await stat(bin)).mode & 0o111).not.toBe(0)
    expect((await run(bin, ['help'])).stdout).toBe('bygg help\n')
    expect(stdout).toContain(`bygg login --server ${origin}`)
  })

  it('säger till när katalogen inte finns i PATH', async () => {
    const { stdout } = await install()
    expect(stdout).toContain('finns inte i PATH')
    const again = await install({ PATH: `${path.join(dir, 'bin')}:${process.env.PATH}` })
    expect(again.stdout).not.toContain('finns inte i PATH')
  })

  it('stannar utan att lämna något efter sig när filen inte går att hämta', async () => {
    const script = installScript(origin).replace('/cli/bygg.mjs', '/cli/finns-inte.mjs')
    const res = run('sh', ['-c', script], { env: { ...process.env, HOME: dir, BYGG_BIN_DIR: path.join(dir, 'bin') } })
    await expect(res).rejects.toMatchObject({ stderr: expect.stringContaining('kunde inte hämta') })
    await expect(stat(path.join(dir, 'bin', 'bygg'))).rejects.toThrow()
    expect((await run('ls', ['-A', path.join(dir, 'bin')])).stdout).toBe('')
  })

  it('använder bara serverns origin', () => {
    expect(installScript('https://bygg.example.se/något/')).toContain("server='https://bygg.example.se'")
  })
})
