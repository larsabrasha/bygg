/**
 * Tar stillbilderna av möblerna på startsidan (src/landing/stills), i ljust och mörkt
 * tema. Startsidan visar dem medan 3D-vyn laddas. De tas med appens egen 3D-vy
 * (?stillbilder, src/landing/Stills.tsx) i Chrome, som måste vara installerat.
 * Sist tas bilden för delade länkar (public/delningsbild.jpg, ?delningsbild), som
 * visar bordets stillbild.
 * Körs med `npm run stills` när en möbel eller studioljuset ändras; bilderna checkas in.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'
import sharp from 'sharp'
import { createServer } from 'vite'

const OUT = new URL('../src/landing/stills/', import.meta.url)
const QUALITY = 80
const SHARE = new URL('../public/delningsbild.jpg', import.meta.url)

const server = await createServer({
  configLoader: 'runner',
  server: { port: 5390, strictPort: true },
  logLevel: 'warn',
})
await server.listen()
const browser = await puppeteer.launch({ channel: 'chrome', headless: true })
try {
  await mkdir(OUT, { recursive: true })
  const page = await browser.newPage()
  await page.setViewport({ width: 1700, height: 900, deviceScaleFactor: 2 })
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
    await page.goto('http://localhost:5390/?stillbilder', { waitUntil: 'networkidle0' })
    // Skriptet har inga DOM-typer; det som körs i sidan står som text.
    const shots = '[...document.querySelectorAll("[data-still]")]'
    await page.waitForFunction(`${shots}.length > 0 && ${shots}.every((s) => s.dataset.ready !== undefined)`, {
      timeout: 60_000,
    })
    // 3D-vyn tonar in under en sekund när den är klar.
    await new Promise((r) => setTimeout(r, 1500))
    const names = (await page.evaluate(`${shots}.map((s) => s.dataset.still)`)) as string[]
    for (const name of names) {
      const png = await (await page.$(`[data-still="${name}"]`))!.screenshot({ omitBackground: true })
      const file = new URL(`${name}-${scheme}.webp`, OUT)
      await writeFile(file, await sharp(png).webp({ quality: QUALITY, alphaQuality: 90 }).toBuffer())
      console.log(file.pathname)
    }
  }
  // Nyckeln för möblerna, som src/landing/stillsKey.test.ts jämför med.
  const key = await page.evaluate('document.querySelector("[data-key]").dataset.key')
  await writeFile(new URL('stills.json', OUT), JSON.stringify({ key }, null, 2) + '\n')

  // Delningsbilden i ljust tema, i exakt 1200 × 630: förhandsvisningarna skalar den själva.
  await page.setViewport({ width: 1300, height: 700, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  await page.goto('http://localhost:5390/?delningsbild', { waitUntil: 'networkidle0' })
  await page.waitForFunction('[...document.images].every((i) => i.complete && i.naturalWidth > 0)')
  const png = await (await page.$('[data-share]'))!.screenshot()
  await writeFile(SHARE, await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toBuffer())
  console.log(SHARE.pathname)
} finally {
  await browser.close()
  await server.close()
}
