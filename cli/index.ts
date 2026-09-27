import { createInterface } from 'node:readline'
import { run } from './main'

/** Startar CLI:t (se bygg.mjs). Allt annat ligger i main.ts, så att det går att testa. */

async function readStdin(): Promise<string> {
  // I en terminal: en rad (nyckeln vid bygg login). Annars allt som skickas in.
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin })
    const line = await new Promise<string>((resolve) => rl.once('line', resolve).once('close', () => resolve('')))
    rl.close()
    return line
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

const code = await run(process.argv.slice(2), {
  out: (t) => process.stdout.write(t + '\n'),
  err: (t) => process.stderr.write(t + '\n'),
  readStdin,
  stdinIsTty: !!process.stdin.isTTY,
  env: process.env,
})
process.exitCode = code
