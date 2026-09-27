/**
 * Tar bilderna av appen på startsidan (src/landing/app): bordet öppet i det realistiska
 * utseendet med en bräda i skivan vald, på dator (1440 × 900) och mobil (390 × 844), i
 * ljust och mörkt tema. En egen dev-server med tom data i en tillfällig katalog; exempel-
 * bordet läggs upp med CLI:t. Chrome måste vara installerat.
 * Körs med `npm run appshots` när appens utseende ändras; bilderna checkas in.
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import puppeteer from 'puppeteer-core'
import sharp from 'sharp'
import { createServer } from 'vite'

const OUT = new URL('../src/landing/app/', import.meta.url)
const PORT = 5391
const BASE = `http://localhost:${PORT}`

/** Var en bräda i bordsskivan ligger i bilden, och hur bred bilden sparas (px). */
const SHOTS = [
  { name: 'dator', width: 1440, height: 900, mobile: false, tap: [560, 380], save: 2000 },
  { name: 'mobil', width: 390, height: 844, mobile: true, tap: [200, 345], save: 700 },
] as const

const data = await mkdtemp(join(tmpdir(), 'bygg-appbilder-'))
process.env.DATA_DIR = data
const server = await createServer({
  configLoader: 'runner',
  server: { port: PORT, strictPort: true },
  logLevel: 'warn',
})
await server.listen()
const browser = await puppeteer.launch({ channel: 'chrome', headless: true })
try {
  await mkdir(OUT, { recursive: true })
  // Inte execFileSync: den stoppar den här processen, och då kan Vite-servern (i samma process) inte svara CLI:t.
  const { stdout: imported } = await promisify(execFile)(
    'node',
    ['cli/bygg.mjs', 'import', 'src/examples/bord.json', '--name', 'Bord', '--server', BASE, '--json'],
    { encoding: 'utf8' },
  )
  const { id } = JSON.parse(imported) as { id: string }
  for (const scheme of ['light', 'dark'] as const) {
    for (const s of SHOTS) {
      const page = await browser.newPage()
      await page.setViewport({
        width: s.width,
        height: s.height,
        deviceScaleFactor: 2,
        isMobile: s.mobile,
        hasTouch: s.mobile,
      })
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
      await page.evaluateOnNewDocument("try { localStorage.setItem('bygg.look', 'realistic') } catch {}")
      // Appen har en öppen anslutning för ändringar (/api/events), så nätet blir aldrig tyst.
      await page.goto(`${BASE}/${id}`, { waitUntil: 'load' })
      // Modellen, trätexturerna och skuggorna.
      await new Promise((r) => setTimeout(r, 7000))
      // Välj brädan. Första gången kan modellen vara sen (Vite gör om filerna), så klicka tills
      // måttrutan syns.
      for (let tries = 0; ; tries++) {
        if (s.mobile) await page.touchscreen.tap(s.tap[0], s.tap[1])
        else await page.mouse.click(s.tap[0], s.tap[1])
        await new Promise((r) => setTimeout(r, 2000))
        if (await page.evaluate("document.body.innerText.includes('Dra i pilen')")) break
        if (tries === 4) throw new Error(`Brädan blev inte vald (${s.name}).`)
      }
      await new Promise((r) => setTimeout(r, 500))
      const png = await page.screenshot()
      const file = new URL(`${s.name}-${scheme === 'light' ? 'ljus' : 'mork'}.webp`, OUT)
      await writeFile(file, await sharp(png).resize(s.save).webp({ quality: 78 }).toBuffer())
      console.log(file.pathname)
      await page.close()
    }
  }
} finally {
  await browser.close()
  await server.close()
  await rm(data, { recursive: true, force: true })
}
