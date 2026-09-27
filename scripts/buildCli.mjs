// Bundles the CLI (cli/index.ts and the app code it runs) into one executable JavaScript file,
// dist/cli/bygg.mjs, with its dependencies included. The server hands it out, and /install.sh
// (server/install.ts) downloads it: installing needs only Node, not this repo.
// Runs after `vite build`, which empties dist/.
import { chmod } from 'node:fs/promises'
import { build } from 'esbuild'

const outfile = 'dist/cli/bygg.mjs'

await build({
  entryPoints: ['cli/index.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  // Some dependencies are CommonJS and call require() for Node's built-in modules; an ES module has no require.
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
})
await chmod(outfile, 0o755)
